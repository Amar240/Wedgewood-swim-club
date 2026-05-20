import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
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

function hasMetadataValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function buildEventItem(
  locationId,
  membershipName,
  phone,
  type,
  numAttending,
  numGuests,
  metadata = {},
) {
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

    if (hasMetadataValue(metadata.membershipNameFromForm)) {
      item.membershipNameFromForm = metadata.membershipNameFromForm;
    }

    if (hasMetadataValue(metadata.guestPass)) {
      item.guestPass = metadata.guestPass;
    }

    if (hasMetadataValue(metadata.formType)) {
      item.formType = metadata.formType;
    }

    if (hasMetadataValue(metadata.email)) {
      item.email = metadata.email;
    }

    if (hasMetadataValue(metadata.eventType)) {
      item.event_type = metadata.eventType;
    }

    if (hasMetadataValue(metadata.checkedInBy)) {
      item.checked_in_by = metadata.checkedInBy;
    }

    if (hasMetadataValue(metadata.source)) {
      item.source = metadata.source;
    }

    if (hasMetadataValue(metadata.userAgent)) {
      item.user_agent = metadata.userAgent;
    }
  }

  if (type === 'sign_out') {
    if (hasMetadataValue(metadata.email)) {
      item.email = metadata.email;
    }

    if (hasMetadataValue(metadata.signedOutBy)) {
      item.signedOutBy = metadata.signedOutBy;
      item.signed_out_by = metadata.signedOutBy;
    }

    if (hasMetadataValue(metadata.manual)) {
      item.manual = metadata.manual;
    }

    if (hasMetadataValue(metadata.eventType)) {
      item.event_type = metadata.eventType;
    }

    if (hasMetadataValue(metadata.source)) {
      item.source = metadata.source;
    }

    if (hasMetadataValue(metadata.userAgent)) {
      item.user_agent = metadata.userAgent;
    }

    if (hasMetadataValue(metadata.activeCheckInSk)) {
      item.activeCheckInSk = metadata.activeCheckInSk;
    }
  }

  return item;
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
  metadata = {},
) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const item = buildEventItem(
      locationId,
      membershipName,
      phone,
      type,
      numAttending,
      numGuests,
      metadata,
    );

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

async function findActiveCheckInEventFromDailyLog(locationId, phone) {
  let exclusiveStartKey;

  do {
    const result = await getDocumentClient().send(
      new QueryCommand({
        TableName: requireEnv('DYNAMO_TABLE_NAME'),
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: '#phone = :phone AND #type = :type AND attribute_exists(GSI1PK)',
        ExpressionAttributeNames: {
          '#phone': 'phone',
          '#type': 'type',
        },
        ExpressionAttributeValues: {
          ':pk': buildDailyPk(locationId),
          ':phone': phone,
          ':type': 'check_in',
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
}

async function findActiveCheckInEventFromActiveIndex(locationId, phone) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const activeItems = await queryAllPages({
    TableName: requireEnv('DYNAMO_TABLE_NAME'),
    IndexName: ACTIVE_MEMBERS_INDEX_NAME,
    KeyConditionExpression: 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': buildActiveMembersPk(locationId),
    },
  });

  return activeItems
    .filter((item) => {
      return normalizePhone(item.phone || item.GSI1SK) === normalizedPhone;
    })
    .sort((a, b) => {
      return String(b.createdAt ?? b.sk ?? '').localeCompare(String(a.createdAt ?? a.sk ?? ''));
    })[0] ?? null;
}

export async function getActiveCheckInEvent(locationId, phone) {
  try {
    const activeItems = await queryAllPages({
      TableName: requireEnv('DYNAMO_TABLE_NAME'),
      IndexName: ACTIVE_MEMBERS_INDEX_NAME,
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :phone',
      ExpressionAttributeValues: {
        ':gsi1pk': buildActiveMembersPk(locationId),
        ':phone': phone,
      },
    });
    const sortedItems = activeItems.sort((a, b) => {
      return String(b.createdAt ?? b.sk ?? '').localeCompare(String(a.createdAt ?? a.sk ?? ''));
    });
    const activeItem = sortedItems[0] ?? null;

    if (activeItem?.pk && activeItem?.sk) {
      return activeItem;
    }

    const normalizedActiveItem = await findActiveCheckInEventFromActiveIndex(locationId, phone);

    if (normalizedActiveItem?.pk && normalizedActiveItem?.sk) {
      return normalizedActiveItem;
    }

    return await findActiveCheckInEventFromDailyLog(locationId, phone);
  } catch (error) {
    throw new Error(`Failed to get active check-in event: ${error.message}`);
  }
}

export async function writeSignOutEventAndClearActive(
  locationId,
  membershipName,
  phone,
  metadata = {},
  activeEvent = null,
) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const activeCheckInEvent = activeEvent ?? await getActiveCheckInEvent(locationId, phone);
    const signOutItem = buildEventItem(
      locationId,
      membershipName,
      phone,
      'sign_out',
      undefined,
      undefined,
      {
        ...metadata,
        activeCheckInSk: activeCheckInEvent?.sk,
      },
    );

    if (!activeCheckInEvent?.pk || !activeCheckInEvent?.sk) {
      await getDocumentClient().send(
        new PutCommand({
          TableName: tableName,
          Item: signOutItem,
        }),
      );

      return {
        signOutEvent: signOutItem,
        activeCheckInEvent: activeCheckInEvent ?? null,
        deactivated: false,
      };
    }

    await getDocumentClient().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: signOutItem,
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: {
                pk: activeCheckInEvent.pk,
                sk: activeCheckInEvent.sk,
              },
              UpdateExpression: [
                'SET signedOutAt = :signedOutAt',
                ', signedOutEventSk = :signedOutEventSk',
                ', signedOutBy = :signedOutBy',
                ' REMOVE GSI1PK, GSI1SK',
              ].join(''),
              ExpressionAttributeValues: {
                ':signedOutAt': signOutItem.createdAt,
                ':signedOutEventSk': signOutItem.sk,
                ':signedOutBy': metadata.signedOutBy ?? 'system',
              },
            },
          },
        ],
      }),
    );

    return {
      signOutEvent: signOutItem,
      activeCheckInEvent,
      deactivated: true,
    };
  } catch (error) {
    throw new Error(`Failed to write sign-out and clear active state: ${error.message}`);
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

export async function resetActiveRows(locationId) {
  try {
    const tableName = requireEnv('DYNAMO_TABLE_NAME');
    const activeRows = await getActiveMembers(locationId);
    let resetCount = 0;
    let skippedCount = 0;

    for (const row of activeRows) {
      if (!row.pk || !row.sk) {
        skippedCount += 1;
        continue;
      }

      await getDocumentClient().send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            pk: row.pk,
            sk: row.sk,
          },
          UpdateExpression: 'SET resetActiveAt = :resetActiveAt REMOVE GSI1PK, GSI1SK',
          ExpressionAttributeValues: {
            ':resetActiveAt': new Date().toISOString(),
          },
        }),
      );
      resetCount += 1;
    }

    return {
      resetCount,
      skippedCount,
    };
  } catch (error) {
    throw new Error(`Failed to reset active rows: ${error.message}`);
  }
}
