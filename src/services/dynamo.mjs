import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

let documentClient;

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

function buildMembershipPk(locationId, membershipName) {
  return `LOCATION#${locationId}#MEMBERSHIP#${membershipName}`;
}

export async function writeCheckInEvent(
  locationId,
  membershipName,
  type,
  numAttending,
  numGuests,
) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const timestamp = new Date().toISOString();
    const item = {
      pk: buildMembershipPk(locationId, membershipName),
      sk: `EVENT#${timestamp}`,
      locationId,
      membershipName,
      type,
      numAttending,
      numGuests,
      createdAt: timestamp,
    };

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

export async function getLatestEvent(locationId, membershipName) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const result = await getDocumentClient().send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': buildMembershipPk(locationId, membershipName),
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );

    return result.Items?.[0] ?? null;
  } catch (error) {
    throw new Error(`Failed to get latest event: ${error.message}`);
  }
}
