import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

let documentClient;
const ACTIVE_MEMBERS_INDEX_NAME = 'active-members-index';
const SEARCH_LIMIT = 20;

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDocumentClient() {
  if (!documentClient) {
    const region = requireEnv('AWS_REGION');
    const client = new DynamoDBClient({ region });
    documentClient = DynamoDBDocumentClient.from(client);
  }

  return documentClient;
}

function getHeader(req, name) {
  return req.get?.(name) ?? req.headers?.[name.toLowerCase()];
}

export function dashboardAuth(req, res, next) {
  const dashboardToken = process.env.DASHBOARD_TOKEN;

  if (dashboardToken && getHeader(req, 'X-Dashboard-Token') !== dashboardToken) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  return next();
}

function getLocationId(req, res) {
  const locationId = req.query?.location_id?.trim?.() ?? req.query?.location_id;

  if (!locationId) {
    res.status(400).json({
      error: 'Missing required query parameter: location_id',
    });
    return null;
  }

  return locationId;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildTodayPk(locationId) {
  return `LOC#${locationId}#DATE#${getLocalDateString()}`;
}

function buildActivePk(locationId) {
  return `LOC#${locationId}#ACTIVE`;
}

function buildMemberPk(locationId) {
  return `LOC#${locationId}`;
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function matchesMemberSearch(item, query) {
  const membershipName = String(item.membershipName ?? '').toLowerCase();
  const queryTerms = query.split(/\s+/).filter((term) => term.length >= 2);
  const queryDigits = normalizePhone(query);
  const phoneDigits = normalizePhone(item.phone);

  if (membershipName.includes(query)) {
    return true;
  }

  if (queryTerms.some((term) => membershipName.includes(term))) {
    return true;
  }

  return queryDigits.length >= 2 && phoneDigits.startsWith(queryDigits);
}

async function queryAllPages(commandInput) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await getDocumentClient().send(
      new QueryCommand({
        ...commandInput,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function scanMemberMatches(commandInput, query) {
  const matches = [];
  let exclusiveStartKey;

  do {
    const result = await getDocumentClient().send(
      new ScanCommand({
        ...commandInput,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    for (const item of result.Items ?? []) {
      if (matchesMemberSearch(item, query) && matches.length < SEARCH_LIMIT) {
        matches.push(item);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey && matches.length < SEARCH_LIMIT);

  return matches;
}

export async function todayHandler(req, res, next) {
  try {
    const locationId = getLocationId(req, res);

    if (!locationId) {
      return null;
    }

    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const events = await queryAllPages({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': buildTodayPk(locationId),
      },
      ScanIndexForward: false,
    });

    const visitedToday = events.filter((event) => event.type === 'check_in').length;
    const signOutsToday = events.filter((event) => event.type === 'sign_out').length;
    const guestsToday = events.reduce((total, event) => total + toNumber(event.numGuests), 0);
    const last5 = events.slice(0, 5).map((event) => ({
      membershipName: event.membershipName,
      type: event.type,
      timestamp: event.createdAt,
      numAttending: event.numAttending,
      numGuests: event.numGuests,
    }));

    void signOutsToday;

    return res.status(200).json({
      visitedToday,
      guestsToday,
      last5,
    });
  } catch (error) {
    return next(error);
  }
}

export async function activeHandler(req, res, next) {
  try {
    const locationId = getLocationId(req, res);

    if (!locationId) {
      return null;
    }

    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const activeMembers = await queryAllPages({
      TableName: tableName,
      IndexName: ACTIVE_MEMBERS_INDEX_NAME,
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': buildActivePk(locationId),
      },
    });
    const members = activeMembers.map((member) => ({
      membershipName: member.membershipName,
      phone: member.phone,
      GSI1SK: member.GSI1SK,
    }));

    return res.status(200).json({
      currentlyInPool: members.length,
      members,
    });
  } catch (error) {
    return next(error);
  }
}

export async function searchHandler(req, res, next) {
  try {
    const locationId = getLocationId(req, res);

    if (!locationId) {
      return null;
    }

    const query = String(req.query?.q ?? '').trim().toLowerCase();

    if (query.length < 2) {
      return res.status(200).json({
        matches: [],
      });
    }

    const tableName = requireEnv('MEMBERS_TABLE_NAME');
    const matches = await scanMemberMatches({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
      },
      ExpressionAttributeValues: {
        ':pk': buildMemberPk(locationId),
      },
      Limit: 100,
    }, query);

    return res.status(200).json({
      matches: matches.map((member) => ({
        membershipName: member.membershipName,
        email: member.email,
        phone: member.phone,
        membershipType: member.membershipType,
        maxMembers: member.maxMembers,
        familyTextRaw: member.familyTextRaw,
        membershipStatus: member.membershipStatus,
      })),
    });
  } catch (error) {
    return next(error);
  }
}
