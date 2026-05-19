import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

let documentClient;
const ACTIVE_MEMBERS_INDEX_NAME = 'active-members-index';

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

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildDailyPk(locationId) {
  return `LOC#${locationId}#DATE#${getLocalDateString()}`;
}

function buildActiveMembersPk(locationId) {
  return `LOC#${locationId}#ACTIVE`;
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

export async function writeCheckInEvent(
  locationId,
  membershipName,
  phone,
  type,
  numAttending,
  numGuests,
) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const timestamp = new Date().toISOString();
    const item = {
      pk: buildDailyPk(locationId),
      sk: `${timestamp}#${randomUUID()}`,
      locationId,
      membershipName,
      phone,
      type,
      createdAt: timestamp,
    };

    if (type === 'check_in') {
      item.GSI1PK = buildActiveMembersPk(locationId);
      item.GSI1SK = phone;
      item.numAttending = numAttending;
      item.numGuests = numGuests;
    }

    await getDocumentClient().send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return item;
  } catch (error) {
    throw new Error(`Failed to write check-in event: ${error.message}`);
  }
}

export async function getLatestEvent(locationId, membershipName, phone) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    let exclusiveStartKey;

    do {
      const result = await getDocumentClient().send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk',
          FilterExpression: '#phone = :phone',
          ExpressionAttributeNames: {
            '#phone': 'phone',
          },
          ExpressionAttributeValues: {
            ':pk': buildDailyPk(locationId),
            ':phone': phone,
          },
          ScanIndexForward: false,
          Limit: 25,
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }),
      );

      if (result.Items?.length > 0) {
        return result.Items[0];
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return null;
  } catch (error) {
    throw new Error(`Failed to get latest event: ${error.message}`);
  }
}

export async function getTodayEvents(locationId) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    return await queryAllPages({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': buildDailyPk(locationId),
      },
      ScanIndexForward: false,
    });
  } catch (error) {
    throw new Error(`Failed to get today's events: ${error.message}`);
  }
}

export async function getActiveMembers(locationId) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    return await queryAllPages({
      TableName: tableName,
      IndexName: ACTIVE_MEMBERS_INDEX_NAME,
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': buildActiveMembersPk(locationId),
      },
    });
  } catch (error) {
    throw new Error(`Failed to get active members: ${error.message}`);
  }
}
