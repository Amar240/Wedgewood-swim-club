import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { getMember } from '../services/members.mjs';

let documentClient;

const START_DATE = '2026-05-24';
const END_DATE = '2026-09-30';

const PAYMENT_TIERS = new Map([
  [530, { membership_tier: 'family', membershipType: 'Family', maxMembers: 5 }],
  [430, { membership_tier: 'family', membershipType: 'Family', maxMembers: 4 }],
  [390, { membership_tier: 'family', membershipType: 'Family', maxMembers: 4 }],
  [340, { membership_tier: 'adult_couple', membershipType: 'Adult Couple', maxMembers: 2 }],
  [290, { membership_tier: 'adult_plus_child', membershipType: 'Adult Plus Child', maxMembers: 2 }],
  [240, { membership_tier: 'adult_single', membershipType: 'Adult Single', maxMembers: 1 }],
  [200, { membership_tier: 'partial', membershipType: 'Partial', maxMembers: 1 }],
  [165, { membership_tier: 'student', membershipType: 'Student', maxMembers: 1 }],
]);

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

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parsePaymentAmount(value) {
  const amount = Number.parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function resolvePaymentTier(paymentAmount) {
  return PAYMENT_TIERS.get(paymentAmount) ?? {
    membership_tier: 'unknown',
    membershipType: 'Unknown',
    maxMembers: 1,
  };
}

function getHeader(req, name) {
  return req.get?.(name) ?? req.headers?.[name.toLowerCase()];
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildMemberPk(locationId) {
  return `LOC#${locationId}`;
}

function buildMemberSk(email) {
  return `MEMBER#${normalizeEmail(email)}`;
}

function getMembershipName(firstName, lastName) {
  return [firstName, lastName].filter(hasValue).join(' ');
}

function getFirstNameKey(firstName) {
  return String(firstName || '').trim().toLowerCase();
}

function getFullNameKey(membershipName) {
  return String(membershipName || '').trim().toLowerCase();
}

function toNullableString(value) {
  const cleanedValue = cleanString(value);
  return hasValue(cleanedValue) ? cleanedValue : null;
}

function normalizePayload(body) {
  const firstName = cleanString(body?.first_name);
  const lastName = cleanString(body?.last_name);
  const email = normalizeEmail(body?.email);
  const paymentAmount = parsePaymentAmount(body?.payment_amount);
  const paymentTier = resolvePaymentTier(paymentAmount);

  return {
    locationId: cleanString(body?.location_id),
    contactId: toNullableString(body?.contact_id),
    firstName,
    lastName,
    membershipName: getMembershipName(firstName, lastName),
    email,
    phone: normalizePhone(body?.phone) || null,
    address: toNullableString(body?.address),
    city: toNullableString(body?.city),
    state: toNullableString(body?.state),
    postalCode: toNullableString(body?.postal_code),
    paymentAmount,
    paymentAmountRaw: toNullableString(body?.payment_amount),
    paymentId: toNullableString(body?.payment_id),
    familyTextRaw: toNullableString(body?.family_text_raw),
    kidsTextRaw: toNullableString(body?.kids_text_raw),
    emergencyContactName: toNullableString(body?.emergency_contact_name),
    emergencyContactPhone: normalizePhone(body?.emergency_contact_phone) || null,
    allergies: toNullableString(body?.allergies),
    ...paymentTier,
  };
}

function getMissingFields(payload) {
  return [
    ['location_id', payload.locationId],
    ['first_name', payload.firstName],
    ['last_name', payload.lastName],
    ['email', payload.email],
  ].filter(([, value]) => !hasValue(value)).map(([field]) => field);
}

function maskPhone(phone) {
  return phone ? `***${phone.slice(-4)}` : null;
}

function logIncomingSignup(payload) {
  console.log('Incoming signup webhook', {
    locationId: payload.locationId,
    contactIdPresent: Boolean(payload.contactId),
    membershipName: payload.membershipName,
    email: payload.email,
    phone: maskPhone(payload.phone),
    paymentAmount: payload.paymentAmount,
    paymentIdPresent: Boolean(payload.paymentId),
    hasFamilyText: Boolean(payload.familyTextRaw),
    hasKidsText: Boolean(payload.kidsTextRaw),
    hasEmergencyContact: Boolean(payload.emergencyContactName || payload.emergencyContactPhone),
    hasAllergies: Boolean(payload.allergies),
  });
}

function logResultingMember(record, wasExisting) {
  console.log('Signup member record upserted', {
    action: wasExisting ? 'updated' : 'created',
    pk: record.pk,
    sk: record.sk,
    membershipName: record.membershipName,
    email: record.email,
    phone: maskPhone(record.phone),
    family_id: record.family_id,
    membership_tier: record.membership_tier,
    membership_status: record.membership_status,
    source: record.source,
  });
}

function buildMemberRecord(payload, existingMember, familyId, now) {
  return {
    pk: buildMemberPk(payload.locationId),
    sk: buildMemberSk(payload.email),
    GSI1PK: `LOC#${payload.locationId}#FAMILY#${familyId}`,
    GSI1SK: `PERSON#${payload.membershipName}`,
    GSI2PK: `LOC#${payload.locationId}#NAME#${getFirstNameKey(payload.firstName)}`,
    GSI2SK: getFullNameKey(payload.membershipName),
    locationId: payload.locationId,
    contact_id: payload.contactId,
    contactId: payload.contactId,
    first_name: payload.firstName,
    last_name: payload.lastName,
    membershipName: payload.membershipName,
    phone: payload.phone,
    email: payload.email,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    postal_code: payload.postalCode,
    payment_amount: payload.paymentAmountRaw,
    paymentAmount: payload.paymentAmount,
    payment_id: payload.paymentId,
    family_text_raw: payload.familyTextRaw,
    familyTextRaw: payload.familyTextRaw,
    kids_text_raw: payload.kidsTextRaw,
    emergency_contact_name: payload.emergencyContactName,
    emergency_contact_phone: payload.emergencyContactPhone,
    allergies: payload.allergies,
    family_id: familyId,
    familyId,
    membership_tier: payload.membership_tier,
    membershipType: payload.membershipType,
    maxMembers: payload.maxMembers,
    membership_status: 'active',
    membershipStatus: 'active',
    start_date: START_DATE,
    end_date: END_DATE,
    source: `ghl_signup_${payload.locationId}_${getLocalDateString()}`,
    importedAt: existingMember?.importedAt ?? now,
    signupUpdatedAt: now,
    updatedAt: now,
  };
}

async function upsertMemberRecord(record, createdAt) {
  const tableName = requireEnv('MEMBERS_TABLE_NAME');
  const expressionAttributeNames = {};
  const expressionAttributeValues = {
    ':createdAt': createdAt,
  };
  const setExpressions = ['#createdAt = if_not_exists(#createdAt, :createdAt)'];

  expressionAttributeNames['#createdAt'] = 'createdAt';

  Object.entries(record).forEach(([key, value], index) => {
    if (key === 'pk' || key === 'sk' || value === undefined) {
      return;
    }

    const nameKey = `#field${index}`;
    const valueKey = `:value${index}`;
    expressionAttributeNames[nameKey] = key;
    expressionAttributeValues[valueKey] = value;
    setExpressions.push(`${nameKey} = ${valueKey}`);
  });

  const result = await getDocumentClient().send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        pk: record.pk,
        sk: record.sk,
      },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes;
}

export async function signupHandler(req, res, next) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (webhookSecret && getHeader(req, 'X-Webhook-Secret') !== webhookSecret) {
      return res.status(401).json({
        valid: false,
        message: 'Unauthorized',
      });
    }

    const payload = normalizePayload(req.body);
    logIncomingSignup(payload);

    const missingFields = getMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        valid: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const existingMember = await getMember(payload.locationId, payload.email);

    if (existingMember) {
      return res.status(200).json({
        valid: true,
        message: 'Member already registered',
        alreadyExists: true,
        membership_tier: existingMember.membershipType,
      });
    }

    const familyId = randomUUID();
    const now = new Date().toISOString();
    const record = buildMemberRecord(payload, existingMember, familyId, now);
    const savedRecord = await upsertMemberRecord(record, now);

    logResultingMember(savedRecord, Boolean(existingMember));

    return res.status(200).json({
      valid: true,
      message: `Added ${payload.membershipName} as a member!`,
      family_id: familyId,
      membership_tier: payload.membership_tier,
    });
  } catch (error) {
    console.error('Failed to process signup webhook', {
      message: error.message,
    });
    return next(error);
  }
}
