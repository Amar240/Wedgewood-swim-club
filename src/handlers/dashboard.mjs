import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

import { resetActiveRows } from '../services/dynamo.mjs';

let documentClient;
const ACTIVE_MEMBERS_INDEX_NAME = 'active-members-index';
const SEARCH_LIMIT = 10;

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

function getPhoneDigits(value) {
  const digits = normalizePhone(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatPhone(value) {
  const digits = getPhoneDigits(value);

  if (digits.length !== 10) {
    return value;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function getNameParts(item) {
  const fullName = String(item.membershipName ?? item.full_name ?? '').trim();
  const nameParts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
  const firstName = String(item.first_name_lower ?? nameParts[0] ?? '').trim().toLowerCase();
  const lastName = String(item.last_name_lower ?? nameParts.at(-1) ?? '').trim().toLowerCase();

  return {
    firstName,
    lastName,
    fullNameLower: fullName.toLowerCase(),
  };
}

function scoreMemberSearch(item, query) {
  const { firstName, lastName, fullNameLower } = getNameParts(item);
  const queryDigits = normalizePhone(query);
  const phoneDigits = getPhoneDigits(item.phone);
  const wholeWordPattern = new RegExp(`(^|\\s)${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);

  if (firstName.startsWith(query)) {
    return 100;
  }

  if (lastName.startsWith(query)) {
    return 80;
  }

  if (queryDigits.length >= 2 && phoneDigits.startsWith(queryDigits)) {
    return 70;
  }

  if (wholeWordPattern.test(fullNameLower)) {
    return 60;
  }

  if (firstName.includes(query) || lastName.includes(query)) {
    return 40;
  }

  return 0;
}

function parseFamilyMembers(familyTextRaw) {
  const rawText = String(familyTextRaw ?? '').replace(/\\n/g, '\n').trim();

  if (!rawText) {
    return [];
  }

  const separator = rawText.includes('\n') ? /\n+/ : /,+/;

  return rawText
    .split(separator)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...relationshipParts] = line.split(/\s+-\s+/);
      return {
        name: name.trim(),
        relationship: relationshipParts.join(' - ').trim(),
      };
    });
}

function mapMemberForDashboard(member, locationId, activePhones) {
  const phoneRaw = getPhoneDigits(member.phone);

  return {
    membershipName: member.membershipName,
    email: member.email,
    phone: formatPhone(member.phone),
    phone_raw: phoneRaw,
    membershipType: member.membershipType,
    maxMembers: member.maxMembers,
    familyTextRaw: member.familyTextRaw,
    familyMembers: parseFamilyMembers(member.familyTextRaw),
    membershipStatus: member.membershipStatus,
    location_id: locationId,
    is_currently_active: activePhones.has(phoneRaw),
  };
}

function sortScoredMatches(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return a.lastName.localeCompare(b.lastName)
    || a.firstName.localeCompare(b.firstName)
    || String(a.item.membershipName ?? '').localeCompare(String(b.item.membershipName ?? ''));
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
      const score = scoreMemberSearch(item, query);

      if (score > 0) {
        const nameParts = getNameParts(item);
        matches.push({
          item,
          score,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
        });
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return matches.sort(sortScoredMatches);
}

async function scanAllPages(commandInput) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await getDocumentClient().send(
      new ScanCommand({
        ...commandInput,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
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
    const members = activeMembers
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .map((member) => ({
        membershipName: member.membershipName,
        email: member.email,
        phone: formatPhone(member.phone || member.GSI1SK),
        phone_raw: getPhoneDigits(member.phone || member.GSI1SK),
        GSI1SK: formatPhone(member.GSI1SK),
        GSI1SK_raw: getPhoneDigits(member.GSI1SK),
        signedInAt: member.createdAt,
        createdAt: member.createdAt,
        pk: member.pk,
        sk: member.sk,
      }));

    return res.status(200).json({
      currentlyInPool: members.length,
      members,
    });
  } catch (error) {
    return next(error);
  }
}

export async function signupsTodayHandler(req, res, next) {
  try {
    const locationId = getLocationId(req, res);

    if (!locationId) {
      return null;
    }

    const tableName = requireEnv('MEMBERS_TABLE_NAME');
    const sourcePrefix = `ghl_signup_${locationId}_${getLocalDateString()}`;
    const members = await scanAllPages({
      TableName: tableName,
      FilterExpression: '#pk = :pk AND begins_with(#source, :sourcePrefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#source': 'source',
      },
      ExpressionAttributeValues: {
        ':pk': buildMemberPk(locationId),
        ':sourcePrefix': sourcePrefix,
      },
    });
    const mappedMembers = members
      .map((member) => ({
        name: member.membershipName ?? member.full_name,
        tier: member.membership_tier ?? member.membershipType,
        signed_up_at: member.signupUpdatedAt ?? member.createdAt ?? member.importedAt,
      }))
      .sort((a, b) => String(b.signed_up_at ?? '').localeCompare(String(a.signed_up_at ?? '')));

    return res.status(200).json({
      count: mappedMembers.length,
      members: mappedMembers,
    });
  } catch (error) {
    return next(error);
  }
}

export async function resetActiveHandler(req, res, next) {
  try {
    const locationId = getLocationId(req, res);

    if (!locationId) {
      return null;
    }

    console.warn('Admin reset-active called', {
      locationId,
    });

    const result = await resetActiveRows(locationId);

    return res.status(200).json({
      valid: true,
      message: `Reset ${result.resetCount} active rows`,
      ...result,
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
    const topMatches = matches.slice(0, SEARCH_LIMIT);
    const activeMembers = matches.length > 0
      ? await queryAllPages({
        TableName: requireEnv('DYNAMO_TABLE_NAME'),
        IndexName: ACTIVE_MEMBERS_INDEX_NAME,
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': buildActivePk(locationId),
        },
      })
      : [];
    const activePhones = new Set(activeMembers.map((member) => {
      return getPhoneDigits(member.phone || member.GSI1SK);
    }).filter(Boolean));

    return res.status(200).json({
      totalMatches: matches.length,
      matches: topMatches.map((match) => {
        return mapMemberForDashboard(match.item, locationId, activePhones);
      }),
    });
  } catch (error) {
    return next(error);
  }
}
