#!/usr/bin/env node

import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

const COLUMNS = {
  fullName: 'Your Full Name',
  email: 'Your Email',
  phone: 'Mobile phone numbers for all people on membership:',
  familyText: 'All names and family relationships on membership:',
  paymentAmount: 'Payment Amount',
  paymentStatus: 'Payment Status',
  submissionDate: 'Submission Date',
};
const REQUIRED_COLUMNS = Object.values(COLUMNS).filter(
  (columnName) => columnName !== COLUMNS.submissionDate,
);

const PAYMENT_MAPPING = new Map([
  [530, { membershipType: 'Family', maxMembers: 5 }],
  [480, { membershipType: 'Family', maxMembers: 5 }],
  [430, { membershipType: 'Family', maxMembers: 4 }],
  [390, { membershipType: 'Family', maxMembers: 4 }],
  [340, { membershipType: 'Family', maxMembers: 3 }],
  [290, { membershipType: 'AdultPlusChild', maxMembers: 2 }],
  [240, { membershipType: 'Adult', maxMembers: 1 }],
  [165, { membershipType: 'Student', maxMembers: 1 }],
]);

const BATCH_SIZE = 25;
const MAX_BATCH_ATTEMPTS = 5;

function usage() {
  console.log('Usage: node scripts/importMembers.mjs ./members.csv [--dry-run]');
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseArgs(args) {
  const unknownFlag = args.find((arg) => arg.startsWith('--') && arg !== '--dry-run');

  if (unknownFlag) {
    throw new Error(`Unknown flag: ${unknownFlag}`);
  }

  return {
    dryRun: args.includes('--dry-run'),
    filePath: args.find((arg) => !arg.startsWith('--')),
  };
}

function parseCsv(csvText) {
  const text = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error('Invalid CSV: unterminated quoted field');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => value.trim() !== ''));
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function toObjects(rows) {
  if (rows.length === 0) {
    return [];
  }

  const headerIndexes = new Map();
  rows[0].forEach((header, index) => {
    headerIndexes.set(normalizeHeader(header), index);
  });
  const missingColumns = REQUIRED_COLUMNS.filter(
    (columnName) => !headerIndexes.has(normalizeHeader(columnName)),
  );

  if (missingColumns.length > 0) {
    throw new Error(`CSV missing required columns: ${missingColumns.join(', ')}`);
  }

  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    get(columnName) {
      const columnIndex = headerIndexes.get(normalizeHeader(columnName));
      return columnIndex === undefined ? '' : (row[columnIndex] ?? '').trim();
    },
  }));
}

function normalizePhone(value) {
  const firstPhone = (value || '').split(/[;,]/)[0] ?? '';
  const digits = firstPhone.replace(/\D/g, '');

  return digits.length === 10 ? digits : null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePaymentAmount(value) {
  const amount = Number.parseFloat((value || '').replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount);
}

function resolvePaymentPlan(paymentAmount) {
  const exactPlan = PAYMENT_MAPPING.get(paymentAmount);

  if (exactPlan) {
    return exactPlan;
  }

  if (paymentAmount > 530) {
    return {
      membershipType: 'Family',
      maxMembers: '5+',
      membershipNote: 'Large family - staff verify count',
    };
  }

  if (paymentAmount >= 165 && paymentAmount <= 530) {
    return {
      membershipType: 'Unknown',
      maxMembers: 5,
      membershipNote: 'Unknown tier - staff verify',
    };
  }

  return null;
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseFamilyMembers(familyTextRaw, primaryName) {
  const primaryNameKey = normalizeName(primaryName);
  const seen = new Set();

  return (familyTextRaw || '')
    .split(/\n|,/)
    .map((value) => value.replace(/^[\s\-*•]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value) => {
      const nameKey = normalizeName(value);

      if (!nameKey || nameKey === primaryNameKey || seen.has(nameKey)) {
        return false;
      }

      seen.add(nameKey);
      return true;
    });
}

function normalizeFamilyText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildDuplicateKey(email, familyTextRaw) {
  return `${email}::${normalizeFamilyText(familyTextRaw)}`;
}

function parseDateMs(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function shouldReplaceDuplicate(existingCandidate, nextCandidate) {
  if (existingCandidate.submissionDateMs !== null && nextCandidate.submissionDateMs !== null) {
    return nextCandidate.submissionDateMs >= existingCandidate.submissionDateMs;
  }

  if (nextCandidate.submissionDateMs !== null) {
    return true;
  }

  if (existingCandidate.submissionDateMs !== null) {
    return false;
  }

  return nextCandidate.rowNumber > existingCandidate.rowNumber;
}

function buildMemberItem(candidate, locationId) {
  const familyId = randomUUID();
  const fullNameLowercase = candidate.membershipName.toLowerCase();
  const firstNameLowercase = candidate.membershipName.split(/\s+/)[0].toLowerCase();

  return {
    pk: `LOC#${locationId}`,
    sk: `MEMBER#${candidate.email}${candidate.memberKeySuffix}`,
    GSI1PK: `LOC#${locationId}#FAMILY#${familyId}`,
    GSI1SK: `PERSON#${candidate.membershipName}`,
    GSI2PK: `LOC#${locationId}#NAME#${firstNameLowercase}`,
    GSI2SK: fullNameLowercase,
    membershipName: candidate.membershipName,
    phone: candidate.phone,
    email: candidate.email,
    membershipType: candidate.membershipType,
    maxMembers: candidate.maxMembers,
    familyTextRaw: candidate.familyTextRaw,
    familyMembers: candidate.familyMembers,
    paymentAmount: candidate.paymentAmount,
    membershipStatus: 'active',
    importedAt: new Date().toISOString(),
    ...(candidate.membershipNote ? { membershipNote: candidate.membershipNote } : {}),
  };
}

function prepareCandidates(rows) {
  const byEmailAndFamilyText = new Map();
  let skipped = 0;

  for (const row of rows) {
    const membershipName = row.get(COLUMNS.fullName).replace(/\s+/g, ' ').trim();
    const paymentStatus = row.get(COLUMNS.paymentStatus);

    if (paymentStatus.toLowerCase() !== 'success') {
      skipped += 1;
      console.log(`⏭️  Skipped (${paymentStatus || 'No status'}): ${membershipName || `row ${row.rowNumber}`}`);
      continue;
    }

    if (!membershipName) {
      skipped += 1;
      console.log(`⚠️  Skipped (no name): row ${row.rowNumber}`);
      continue;
    }

    const email = normalizeEmail(row.get(COLUMNS.email));

    if (!isValidEmail(email)) {
      skipped += 1;
      console.log(`⚠️  Skipped (no valid email): ${membershipName}`);
      continue;
    }

    const phone = normalizePhone(row.get(COLUMNS.phone));

    const paymentAmount = parsePaymentAmount(row.get(COLUMNS.paymentAmount));
    const paymentPlan = resolvePaymentPlan(paymentAmount);

    if (!paymentPlan) {
      skipped += 1;
      console.log(`⚠️  Skipped (low or missing payment amount): ${membershipName}`);
      continue;
    }

    const familyTextRaw = row.get(COLUMNS.familyText);
    const candidate = {
      rowNumber: row.rowNumber,
      membershipName,
      phone,
      email,
      familyTextRaw,
      familyMembers: parseFamilyMembers(familyTextRaw, membershipName),
      paymentAmount,
      membershipType: paymentPlan.membershipType,
      maxMembers: paymentPlan.maxMembers,
      membershipNote: paymentPlan.membershipNote,
      submissionDateMs: parseDateMs(row.get(COLUMNS.submissionDate)),
    };
    const duplicateKey = buildDuplicateKey(email, familyTextRaw);

    const existingCandidate = byEmailAndFamilyText.get(duplicateKey);

    if (!existingCandidate) {
      byEmailAndFamilyText.set(duplicateKey, candidate);
      continue;
    }

    skipped += 1;

    if (shouldReplaceDuplicate(existingCandidate, candidate)) {
      console.log(`⚠️  Duplicate skipped: ${existingCandidate.membershipName}`);
      byEmailAndFamilyText.set(duplicateKey, candidate);
    } else {
      console.log(`⚠️  Duplicate skipped: ${candidate.membershipName}`);
    }
  }
  const candidates = [...byEmailAndFamilyText.values()]
    .sort((left, right) => left.rowNumber - right.rowNumber);
  const emailCounts = new Map();

  for (const candidate of candidates) {
    const nextCount = (emailCounts.get(candidate.email) ?? 0) + 1;
    emailCounts.set(candidate.email, nextCount);
    candidate.memberKeySuffix = nextCount === 1 ? '' : `#${nextCount}`;
  }

  return {
    candidates,
    skipped,
  };
}

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function batchWriteWithRetry(documentClient, tableName, items) {
  let writeRequests = items.map((item) => ({
    PutRequest: {
      Item: item,
    },
  }));

  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
    const result = await documentClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: writeRequests,
        },
      }),
    );
    writeRequests = result.UnprocessedItems?.[tableName] ?? [];

    if (writeRequests.length === 0) {
      return;
    }

    await sleep(100 * 2 ** (attempt - 1));
  }

  throw new Error(`${writeRequests.length} items were still unprocessed after retries`);
}

async function writeItems(items, { region, tableName }) {
  const client = new DynamoDBClient({ region });
  const documentClient = DynamoDBDocumentClient.from(client);
  let imported = 0;
  let skipped = 0;

  for (const chunk of chunkItems(items, BATCH_SIZE)) {
    try {
      await batchWriteWithRetry(documentClient, tableName, chunk);

      for (const item of chunk) {
        imported += 1;
        console.log(`✅ Imported: ${item.membershipName} (${item.phone})`);
      }
    } catch (batchError) {
      console.error(`⚠️  Batch failed, retrying records individually: ${batchError.message}`);

      for (const item of chunk) {
        try {
          await batchWriteWithRetry(documentClient, tableName, [item]);
          imported += 1;
          console.log(`✅ Imported: ${item.membershipName} (${item.phone})`);
        } catch (recordError) {
          skipped += 1;
          console.error(`⚠️  Skipped (write failed): ${item.membershipName} - ${recordError.message}`);
        }
      }
    }
  }

  return { imported, skipped };
}

async function main() {
  const { dryRun, filePath } = parseArgs(process.argv.slice(2));

  if (!filePath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const region = requireEnv('AWS_REGION');
  const tableName = requireEnv('MEMBERS_TABLE_NAME');
  const locationId = requireEnv('GHL_LOCATION_ID');
  const csvText = await readFile(filePath, 'utf8');
  const rows = toObjects(parseCsv(csvText));

  console.log(`Found ${rows.length} CSV records in ${basename(filePath)}.`);

  const { candidates, skipped: initialSkipped } = prepareCandidates(rows);
  const items = candidates.map((candidate) => buildMemberItem(candidate, locationId));

  if (dryRun) {
    for (const item of items) {
      console.log(`🧪 Would import: ${item.membershipName} (${item.phone})`);
    }

    console.log(`✅ Done. Imported 0 of ${rows.length} records. ${initialSkipped} skipped. Dry run would import ${items.length}.`);
    return;
  }

  const { imported, skipped: writeSkipped } = await writeItems(items, { region, tableName });
  const skipped = initialSkipped + writeSkipped;

  console.log(`✅ Done. Imported ${imported} of ${rows.length} records. ${skipped} skipped.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`❌ Import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
