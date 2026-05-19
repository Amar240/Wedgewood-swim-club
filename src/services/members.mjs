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

function buildMemberPk(locationId) {
  return `LOCATION#${locationId}`;
}

function buildMemberSk(membershipName, phone) {
  return `MEMBERSHIP#${membershipName}#PHONE#${phone}`;
}

export async function writeMember(
  locationId,
  membershipName,
  phone,
  email,
  membershipType,
  maxMembers,
  familyMembers,
) {
  try {
    const tableName = requireEnv('MEMBERS_TABLE_NAME');
    const timestamp = new Date().toISOString();
    const item = {
      pk: buildMemberPk(locationId),
      sk: buildMemberSk(membershipName, phone),
      locationId,
      membershipName,
      phone,
      email,
      membershipType,
      maxMembers,
      familyMembers,
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
    throw new Error(`Failed to write member: ${error.message}`);
  }
}

export async function getMember(locationId, membershipName, phone) {
  try {
    const tableName = requireEnv('MEMBERS_TABLE_NAME');
    const result = await getDocumentClient().send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: {
          ':pk': buildMemberPk(locationId),
          ':sk': buildMemberSk(membershipName, phone),
        },
        Limit: 1,
      }),
    );

    return result.Items?.[0] ?? null;
  } catch (error) {
    throw new Error(`Failed to get member: ${error.message}`);
  }
}

export async function memberExists(locationId, membershipName, phone) {
  try {
    const member = await getMember(locationId, membershipName, phone);
    return Boolean(member);
  } catch (error) {
    throw new Error(`Failed to check member existence: ${error.message}`);
  }
}
