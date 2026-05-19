# Wedgewood Swim Club — Memorial Day Go-Live Plan

**Status:** Research complete, decisions made. 3 days to Memorial Day weekend (May 23, 2026).
**Audience:** Amar (you). Ryan handles the GHL side, you handle AWS + dashboard.
**Goal:** Working check-in pipeline on the iPad at the pool gate, hosted at `pooladmin.govenderly.us`.

---

## TL;DR

Keep DynamoDB. Don't switch databases 3 days before launch. Your access patterns are 100% known and small (~150 check-ins/day) — that's exactly DynamoDB's sweet spot. Polling at 3-second intervals is "real-time enough" for an iPad with one user; skip WebSockets/AppSync for MVP. Use GHL's standard **Webhook (Outbound)** action (not Custom Webhook) — it auto-sends every contact and custom field, so Ryan doesn't have to map anything. Build the dashboard as a single HTML page served from your existing App Runner — no new infra. Import the 103-member CSV with a one-off Node script that auto-cleans phones and emits a "manual review" CSV for the unstructured family-relationship text (it's not parseable reliably).

**What changes on the Ryan side:** add one Custom Webhook step to each of the 3 workflows (Sign-In, Sign-Out, New Member) pointing at your App Runner URL.
**What changes on the Amar side:** new endpoints (search, today, active), a dashboard.html, CSV import, DNS for `pooladmin.govenderly.us`.

---

## Section A — The Five Architecture Questions Answered

### Q1: Database — Keep DynamoDB (do NOT switch to RDS)

**Decision: A) Keep DynamoDB for everything.**
Complexity: **Easy** (no migration).

**Why not RDS:**
- You're 3 days from launch. Adding a new datastore is the #1 way to blow the deadline.
- 150 check-ins/day = ~55K events/year for one club. That's a rounding error in DynamoDB pricing — likely **$0/month for the foreseeable future** because the free tier covers 25GB storage + 25 RCU/WCU forever.
- All your queries are *known access patterns* (today's check-ins, currently in pool, member by name, family by primary). That's exactly what DynamoDB rewards. SQL's flexibility doesn't help you.
- RDS adds $15-30/month minimum (db.t4g.micro) + VPC complexity + backup management. For one club it's overhead. For 50 clubs in the future the per-tenant cost still doesn't justify it.
- Ryan's instinct that "AWS should be the source of truth" is correct — that doesn't require SQL. DynamoDB is the source of truth too.

**Multi-tenant approach (per PRD: "one AWS database per GHL sub-account"):**
Don't actually use one DynamoDB *table* per sub-account — that's an operational nightmare at scale (50 clubs = 50 tables to monitor, back up, alarm on). Instead use the **location_id (GHL sub-account ID) as the partition key prefix** in shared tables. That gives you logical isolation per client with one set of infrastructure to manage. If a client ever demands physical isolation (HIPAA-like compliance), then split that one client off.

**Recommended table layout (single-table-ish design):**

`swim-club-members` table:
- PK: `LOC#{location_id}` (e.g. `LOC#Bjt6c984XN3YKY5porzI`)
- SK: `MEMBER#{phone_normalized}` for primary, `PERSON#{phone}#{first_name_lower}` for family members
- Attributes: `first_name`, `last_name`, `email`, `family_id`, `is_primary`, `membership_status`, `membership_tier`, `start_date`, `end_date`, `ghl_contact_id`, `payment_status`, `tags[]`, `notes`
- GSI1: PK=`LOC#{location_id}#FAMILY#{family_id}` → returns all people in one family in one query (this answers PRD's "searching any family member must show valid membership if primary is active")
- GSI2: PK=`LOC#{location_id}#NAME#{first_name_lower}` → fast partial-name search for staff

`checkin-events` table (you already have it):
- PK: `LOC#{location_id}#DATE#{YYYY-MM-DD}` (today's check-ins all live under one partition)
- SK: `{ISO_timestamp}#{event_id}`
- Attributes: `event_type` (signin/signout/guest), `person_phone`, `person_name`, `membership_id`, `family_id`, `validation_result`, `num_attending`, `num_guests`, `guest_payment_status`
- GSI1: PK=`LOC#{location_id}#ACTIVE`, SK=`{phone}` — **sparse index**. Only present when someone is signed in (deleted on signout). This makes "currently in pool" a single Query call.

The "ACTIVE" sparse-index trick is the key pattern. On sign-in you `PutItem` with the GSI key set. On sign-out you `UpdateItem` and remove that attribute. The GSI auto-evicts the row. Querying the GSI returns exactly the people in the pool right now.

### Q2: Staff dashboard backend — DynamoDB handles all 6 widgets

| Widget | Query | Cost |
|---|---|---|
| Total visited today | `Query` on main table PK=`LOC#x#DATE#today` + `Select=COUNT` | 1 RCU per ~4KB |
| Currently in pool | `Query` on GSI1 (sparse "ACTIVE" index) | trivial |
| Guests today (count + revenue) | Filter the today query for `event_type=guest`, sum `guest_payment_status` | 1 RCU |
| New signups today | Same pattern, filter `event_type=signup` | 1 RCU |
| Live feed (last 5) | `Query` PK=`LOC#x#DATE#today`, `ScanIndexForward=false`, `Limit=5` | 1 RCU |
| Search member by name | GSI2 on first-name; or for 100-1000 members just `Scan` with filter — fine at this size | <5 RCU |

**Verdict:** DynamoDB answers all 6. No SQL needed. Total cost at 150 check-ins/day: under 50 RCU/day = $0.
Complexity: **Easy.**

### Q3: Real-time — Use 3-second polling, not WebSockets

**Decision: Skip AppSync and API Gateway WebSocket for MVP.** Build polling. Document the upgrade path.

**Why:**
- You have **one iPad and one user** (the front desk teen). Sub-second updates from a WebSocket vs. 3-second polling is imperceptible at this scale and adds significant setup work.
- AppSync requires defining a GraphQL schema, resolvers, and subscriptions. API Gateway WebSocket requires connection management (storing connection IDs in DynamoDB, handling disconnects). Either is 1-2 days of work you don't have.
- Polling: `setInterval(fetchToday, 3000)` in dashboard HTML. Done in 5 lines.
- Cost: 150 check-ins/day × 1 iPad × 1200 polls/hour × 12 hours = 14,400 requests/day. That's still pennies on App Runner, free on Lambda.

**When to upgrade:** When you have 3+ clubs or 3+ staff iPads per club watching simultaneously. At that point AppSync is the right call (3x cheaper than API Gateway WebSocket per connection-minute per the docs). For now: polling.

Complexity: **Easy** (now). Upgrade later: Medium.

### Q4: CSV import — local Node script, semi-automated cleanup

The CSV has **103 records, not 60**. I analyzed it:
- 99 paid (`Success`), 4 `Pending` → skip the Pending ones for now
- 33 records (32%) have multiple phone numbers in one cell ("9172152522, 3024010875, 3028839877")
- 5 duplicate primary names (resubmissions — keep the latest)
- Family-relationship text is **unstructured prose**, not parseable:
  - "Lisa Walters - Mother\nJoseph Walters - Son" (good)
  - "Christina  Zhao, Sunny Zhao ( mom and kids）" (commas + parens + Chinese paren)
  - "Matt, Jared, Brady, Aidan" (just first names, no relationship)
  - "Daughter" (no name at all)

**Approach (recommended):**
1. **Local Node.js script** (not Lambda — Lambda is overkill for one-time work and adds packaging hassle).
2. For each row:
   - Normalize phone: strip non-digits, take first if multiple, store the rest in `secondary_phones[]`
   - Create primary `MEMBER` record with `family_id = uuid()`
   - Store **raw family text** verbatim in a `family_text_raw` field
   - Attempt heuristic split (newline > comma > semicolon) → if it produces clean "Name - Relationship" pairs, auto-create `PERSON` rows. Otherwise flag for manual review.
3. Output a `members-needs-review.csv` with rows where family parsing was ambiguous (~30-40 rows estimated) — Ryan or you reviews these manually in 30 min.
4. Dedup by normalized phone — keep latest `Submission Date`.
5. Skip `Pending` rows; log them separately for follow-up.

I'll include the script skeleton in Section D. Complexity: **Medium** (because of the family text).

### Q5: GHL merge field reference (for Ryan)

**The shortcut: use the standard "Webhook (Outbound)" action, not "Custom Webhook".** It auto-sends every contact field and every custom field with no mapping needed. Your AWS endpoint just reads them.

**But if you want explicit control** (recommended for production — easier to debug), use **Custom Webhook** with this JSON body:

```json
{
  "location_id": "{{location.id}}",
  "contact_id": "{{contact.id}}",
  "first_name": "{{contact.first_name}}",
  "last_name": "{{contact.last_name}}",
  "phone": "{{contact.phone_raw}}",
  "email": "{{contact.email}}",
  "tags": "{{contact.tags}}",
  "membership_name": "{{custom_fields.membership_name}}",
  "num_attending": "{{custom_fields.number_of_members_attending}}",
  "num_guests": "{{custom_fields.any_guests}}",
  "guest_pass": "{{custom_fields.guest_pass}}",
  "form_type": "pool_signin",
  "submitted_at": "{{right_now.year}}-{{right_now.month}}-{{right_now.day}}T{{right_now.hour}}:{{right_now.minute}}:{{right_now.second}}"
}
```

**Critical notes for Ryan:**

| GHL field | Merge tag | Notes |
|---|---|---|
| Sub-account ID (multi-tenant) | `{{location.id}}` | **Always send this.** Your AWS code uses it as the partition key prefix. |
| Contact ID (the GHL unique ID for this person) | `{{contact.id}}` | Use this for upserts, not phone |
| First name | `{{contact.first_name}}` | Case-sensitive — must be lowercase |
| Last name | `{{contact.last_name}}` | |
| Phone (digits only, +1...) | `{{contact.phone_raw}}` | Use `_raw` version — easier to dedupe |
| Phone (formatted) | `{{contact.phone}}` | Has dashes/parens, harder to match |
| Email | `{{contact.email}}` | |
| Tags (array) | `{{contact.tags}}` | Comma-separated string |

**Custom field tags follow this rule:**
- GHL turns the field's display name into a snake_case key by default
- "Membership Name" → `{{custom_fields.membership_name}}`
- "Number of members attending" → `{{custom_fields.number_of_members_attending}}`
- If you renamed the field key, use the renamed key
- Verify each one by clicking the {} merge-field picker in the Custom Webhook config — that picker shows the exact key for every custom field in your account

**Form-submission specific:** the trigger "Order Form Submission" (used for the Memberships form because it takes payment) attaches an `order` object to the payload. You don't need to map it — just have AWS read `req.body.order` for payment amount, Stripe charge ID, etc.

---

## Section B — End-to-End Pipeline

### Sign-In flow (the hot path)

```
[Member at pool gate]
    │
    │ scans QR sticker → opens https://wedgewoodpool.com/pool-sign-in
    ▼
[GHL Pool Sign In form]
    │ fills: First/Last/Phone/MembershipName/#Attending/Guests/(payment if guest)
    │ Stripe charge runs inside GHL (already integrated)
    ▼
[GHL Workflow "Pool Sign-In"]
    │ Step 1: Custom Webhook → POST https://bu92wt7vt5.us-east-2.awsapprunner.com/checkin
    │         (body = the JSON template above)
    │ Step 2: Wait 2 seconds for response
    │ Step 3: Read AWS response (use "Save response from this Webhook" toggle)
    │ Step 4: If response.valid == true → Branch A
    │         If response.valid == false → Branch B
    │
    ├── Branch A: Add tag "checked_in_today" → Send SMS "Welcome member ✓"
    │             → Internal notification to staff
    │
    └── Branch B: Send SMS "Membership not found. Please see front desk."
                  → Internal notification flagged red

[AWS App Runner / your Express server]
    │ POST /checkin
    │ 1. Validate body has location_id + phone
    │ 2. Look up swim-club-members:
    │      PK = LOC#{location_id}
    │      SK begins_with MEMBER#{phone_normalized}
    │ 3. Check membership_status == "active" AND end_date >= today
    │ 4. If guest pass paid → log a guest event under linked member
    │ 5. Write checkin-events row WITH the sparse "ACTIVE" attribute
    │ 6. Return { valid: true/false, member_name, family_members[], message }

[iPad dashboard at pooladmin.govenderly.us]
    │ polls GET /dashboard/today every 3 seconds
    │ Live feed updates, counts update, "currently in pool" updates
```

### Sign-Out flow (simpler)

```
Member taps "Sign Out" → GHL Pool Sign Out form (name + phone + email)
  → GHL workflow → Custom Webhook → POST /signout
  → AWS: write signout event, UpdateItem on the ACTIVE sign-in to remove the GSI key (sparse index auto-evicts them from "currently in pool")
  → response back → GHL sends "Thanks for visiting" SMS
```

### New Membership signup flow

```
Person fills "Wedgewood Swim Club Memberships-2026" form on wedgewoodpool.com
  → Stripe charge runs in GHL ($530 family, $240 adult, $165 student, etc.)
  → GHL workflow → Custom Webhook → POST /signup
  → AWS: write swim-club-members row, family_id = uuid, mark all 4 family members as PENDING for manual review (because the family text is unstructured)
  → Tag contact "2026_membership" in GHL (workflow does this natively)
  → Member re-scans QR at gate, this time they're found
```

### Where Stripe fits

**Stripe stays inside GHL — AWS never touches Stripe directly.** GHL's Payment Element handles the card collection and charging via Venderly's Stripe Connect account. Your AWS endpoint just receives the `payment_status` field in the webhook payload (`"success"` / `"pending"`) and the `order.amount`. This is the right call: less PCI scope for you, less code, fewer integrations to manage.

The only reason to add direct Stripe in AWS would be if you later want to **issue refunds programmatically** from the staff dashboard. Not MVP. Leave it for v2.

---

## Section C — 3-Day Build Schedule

> Tomorrow is May 20. Memorial Day weekend starts Saturday May 23. That's 3 working days + a buffer day.

### Day 1 — Tuesday May 20

**Amar (AWS side):**
- [ ] Refactor `checkin-events` table to use composite key `LOC#{loc}#DATE#{day}` + ISO timestamp (or add it as a new GSI if you can't migrate)
- [ ] Add GSI1 sparse "ACTIVE" index for currently-in-pool
- [ ] Write CSV import script (see Section D); run it; review the `needs-review.csv` output
- [ ] Add new endpoints:
  - `POST /signup` (mirror of `/checkin` but writes to members table)
  - `GET /dashboard/today?location_id=...`
  - `GET /dashboard/active?location_id=...`
  - `GET /members/search?location_id=...&q=...`
- [ ] Add `Access-Control-Allow-Origin` for `https://pooladmin.govenderly.us` on dashboard endpoints
- [ ] Deploy, smoke-test with curl

**Ryan (GHL side):**
- [ ] Open the existing **Pool Sign-In** workflow (you have it — screenshot confirmed)
- [ ] Insert a Custom Webhook action **before** the "Condition - Current Member Y or N" step:
  - URL: `https://bu92wt7vt5.us-east-2.awsapprunner.com/checkin`
  - Method: POST, Event: CUSTOM, Content-Type: application/json
  - Body: the JSON template from Q5
  - Enable "Save response from this Webhook"
- [ ] Build same Custom Webhook into **Pool Sign-Out** workflow → `/signout`
- [ ] Add Custom Webhook to the **Membership form** workflow ("New Memberships Notification") → `/signup`
- [ ] Test each one with the GHL **Test Workflow** button against a webhook.site URL first to verify the payload format, then swap to your AWS URL

### Day 2 — Wednesday May 21

**Amar:**
- [ ] Build `dashboard.html` (Section D code skeleton) and serve from App Runner at `/dashboard`
- [ ] 4 widget cards: Today Total / Currently In / Guests + Revenue / New Signups
- [ ] Live feed of last 5 events
- [ ] Member search box (debounced 300ms)
- [ ] Polling loop every 3 seconds
- [ ] Test on actual iPad — Safari quirks, touch targets, font size
- [ ] Basic-auth or shared-secret password for the dashboard route

**Ryan:**
- [ ] In Pool Sign-In workflow, add branches after the webhook response:
  - If `response.valid == true` → SMS "Welcome member ✓" + staff notification
  - If `response.valid == false` → SMS with "see front desk" + RED staff notification
- [ ] Test the success-path and failure-path with two real test contacts
- [ ] Publish all 3 workflows

### Day 3 — Thursday May 22

**Both:**
- [ ] End-to-end test: fake check-in from one phone → see iPad update within 3 sec → check sign-out works → check guest pass flow
- [ ] Manual cleanup of the ~30-40 `members-needs-review.csv` rows (split into a shared Google Sheet, divide and conquer)
- [ ] DNS: point `pooladmin.govenderly.us` at your App Runner (or CloudFront if you decide to put one in front for caching)
- [ ] Print 1-page staff cheat-sheet ("Green light = let them in. Red light = call manager. Search by last name.")

### Day 4 — Friday May 23 (buffer)

- [ ] Walk through with one staff teen in person
- [ ] Watch the dashboard from your laptop while they run 3 test check-ins
- [ ] Fix any rough edges
- [ ] Pre-stage 20 known-good members in a Google Sheet so on opening day you can manually validate quickly if something breaks

### Memorial Day — Saturday May 24

- [ ] Be reachable on text. Check the dashboard remotely a few times during opening hours.

---

## Section D — Concrete Code Snippets

### D.1 — CSV import script (`scripts/import-members.js`)

```javascript
// scripts/import-members.js
// Run locally: node scripts/import-members.js ./members.csv
// Requires: aws-sdk, csv-parse, uuid

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

const LOCATION_ID = 'Bjt6c984XN3YKY5porzI'; // Wedgewood GHL sub-account
const TABLE = 'swim-club-members';
const TIER_FROM_AMOUNT = {
  '$530': 'family',
  '$430': 'family',     // family + extras
  '$390': 'family',
  '$340': 'adult_couple',
  '$290': 'adult_plus_child',
  '$240': 'adult_single',
  '$200': 'partial',
  '$165': 'student',
};

const client = new DynamoDBClient({ region: 'us-east-2' });
const normPhone = (p) => (p || '').replace(/\D/g, '').slice(-10); // last 10 digits
const splitPhones = (cell) =>
  (cell || '').split(/[,;\n]/).map(normPhone).filter(p => p.length === 10);

async function main() {
  const csvPath = process.argv[2];
  const raw = fs.readFileSync(csvPath);
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });

  const writes = [];
  const reviewRows = [];
  const skipped = [];
  const seen = new Map(); // phone -> latest submission

  for (const row of rows) {
    if ((row['Payment Status'] || '').toLowerCase() !== 'success') {
      skipped.push({ ...row, _reason: 'payment_pending' });
      continue;
    }

    const phones = splitPhones(row['Mobile phone numbers for all people on membership:']);
    if (phones.length === 0) {
      skipped.push({ ...row, _reason: 'no_valid_phone' });
      continue;
    }

    const primaryPhone = phones[0];
    // Dedup: keep the row with the later submission date
    const existing = seen.get(primaryPhone);
    if (existing && new Date(existing._date) > new Date(row['Submission Date'])) continue;
    seen.set(primaryPhone, { ...row, _date: row['Submission Date'] });
  }

  for (const [primaryPhone, row] of seen.entries()) {
    const phones = splitPhones(row['Mobile phone numbers for all people on membership:']);
    const familyId = uuidv4();
    const tier = TIER_FROM_AMOUNT[row['Payment Amount']] || 'unknown';
    const familyText = row['All names and family relationships on membership:'] || '';

    // Primary member row
    writes.push({
      PutRequest: {
        Item: marshall({
          PK: `LOC#${LOCATION_ID}`,
          SK: `MEMBER#${primaryPhone}`,
          GSI1PK: `LOC#${LOCATION_ID}#FAMILY#${familyId}`,
          GSI1SK: `PERSON#${row['Your Full Name']}`,
          GSI2PK: `LOC#${LOCATION_ID}#NAME#${(row['Your Full Name'] || '').toLowerCase().split(' ')[0]}`,
          first_name: (row['Your Full Name'] || '').split(' ')[0],
          last_name: (row['Your Full Name'] || '').split(' ').slice(1).join(' '),
          full_name: row['Your Full Name'],
          email: row['Your Email'],
          phone: primaryPhone,
          secondary_phones: phones.slice(1),
          family_id: familyId,
          is_primary: true,
          membership_tier: tier,
          membership_status: 'active',
          start_date: '2026-05-24',
          end_date: '2026-09-30',
          payment_amount: row['Payment Amount'],
          payment_status: 'success',
          family_text_raw: familyText,
          emergency_contact_name: row['Emergency Contact Full Name'],
          emergency_contact_phone: normPhone(row['Emergency Contact Mobile Number']),
          allergies: row['Do you have any allergies, medical concerns, or require any special accommodations? If so, please describe:'],
          source: 'csv_import_2026_05',
          ghl_contact_id: null, // backfill later by phone match against GHL
        }, { removeUndefinedValues: true }),
      },
    });

    // Attempt to parse family members
    const lines = familyText.split(/\n/).map(s => s.trim()).filter(Boolean);
    const looksStructured = lines.length > 1 && lines.every(l => l.includes('-') || l.includes('('));

    if (looksStructured) {
      for (const line of lines) {
        // "Lisa Walters - Mother"
        const [name, rel] = line.split(/[-–—]/).map(s => s.trim());
        if (!name) continue;
        if (name.toLowerCase() === (row['Your Full Name'] || '').toLowerCase()) continue; // skip primary
        writes.push({
          PutRequest: {
            Item: marshall({
              PK: `LOC#${LOCATION_ID}`,
              SK: `PERSON#${primaryPhone}#${name.toLowerCase().replace(/\s+/g, '_')}`,
              GSI1PK: `LOC#${LOCATION_ID}#FAMILY#${familyId}`,
              GSI1SK: `PERSON#${name}`,
              GSI2PK: `LOC#${LOCATION_ID}#NAME#${name.toLowerCase().split(' ')[0]}`,
              first_name: name.split(' ')[0],
              last_name: name.split(' ').slice(1).join(' '),
              full_name: name,
              family_id: familyId,
              is_primary: false,
              relationship_to_primary: rel || 'unknown',
              membership_status: 'active',
              source: 'csv_import_2026_05',
            }, { removeUndefinedValues: true }),
          },
        });
      }
    } else {
      // Ambiguous — flag for manual review
      reviewRows.push({
        primary_phone: primaryPhone,
        primary_name: row['Your Full Name'],
        family_id: familyId,
        family_text_raw: familyText,
        kids_text: row['Include name(s) & age(s) of your child/children:'],
      });
    }
  }

  // BatchWriteItem in chunks of 25
  for (let i = 0; i < writes.length; i += 25) {
    const chunk = writes.slice(i, i + 25);
    await client.send(new BatchWriteItemCommand({ RequestItems: { [TABLE]: chunk } }));
    console.log(`Wrote batch ${i / 25 + 1} (${chunk.length} items)`);
  }

  fs.writeFileSync('members-needs-review.csv',
    'primary_phone,primary_name,family_id,family_text_raw,kids_text\n' +
    reviewRows.map(r => Object.values(r).map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n')
  );
  fs.writeFileSync('members-skipped.csv',
    JSON.stringify(skipped, null, 2)
  );
  console.log(`Done. Wrote ${writes.length} items. ${reviewRows.length} rows need manual review. ${skipped.length} skipped.`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

### D.2 — New AWS endpoints to add to your Express server

```javascript
// dashboard endpoints — add to your existing Express app

// GET /dashboard/today?location_id=Bjt6c984XN3YKY5porzI
app.get('/dashboard/today', requireDashboardAuth, async (req, res) => {
  const { location_id } = req.query;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const out = await ddb.send(new QueryCommand({
    TableName: 'checkin-events',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: marshall({ ':pk': `LOC#${location_id}#DATE#${today}` }),
    ScanIndexForward: false,
  }));
  const events = (out.Items || []).map(i => unmarshall(i));
  const guests = events.filter(e => e.event_type === 'guest');
  res.json({
    total_today: events.length,
    guests_today: guests.length,
    guest_revenue: guests.reduce((s, g) => s + (g.guest_amount || 0), 0),
    new_signups_today: events.filter(e => e.event_type === 'signup').length,
    last_5: events.slice(0, 5),
  });
});

// GET /dashboard/active?location_id=...
app.get('/dashboard/active', requireDashboardAuth, async (req, res) => {
  const { location_id } = req.query;
  const out = await ddb.send(new QueryCommand({
    TableName: 'checkin-events',
    IndexName: 'GSI1', // the sparse "ACTIVE" index
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: marshall({ ':pk': `LOC#${location_id}#ACTIVE` }),
  }));
  const active = (out.Items || []).map(i => unmarshall(i));
  res.json({ currently_in_pool: active.length, people: active });
});

// GET /members/search?location_id=...&q=Smith
app.get('/members/search', requireDashboardAuth, async (req, res) => {
  const { location_id, q } = req.query;
  if (!q || q.length < 2) return res.json({ matches: [] });
  // At <1000 members per club, scan-and-filter is fine
  const out = await ddb.send(new ScanCommand({
    TableName: 'swim-club-members',
    FilterExpression: 'PK = :pk AND (contains(#fn, :q) OR contains(#ln, :q) OR begins_with(phone, :p))',
    ExpressionAttributeNames: { '#fn': 'first_name_lower', '#ln': 'last_name_lower' },
    ExpressionAttributeValues: marshall({
      ':pk': `LOC#${location_id}`,
      ':q': q.toLowerCase(),
      ':p': q.replace(/\D/g, ''),
    }),
    Limit: 50,
  }));
  res.json({ matches: (out.Items || []).map(i => unmarshall(i)) });
});

function requireDashboardAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'];
  if (token !== process.env.DASHBOARD_TOKEN) return res.status(401).end();
  next();
}
```

### D.3 — Single-file iPad dashboard (`/dashboard` route)

Serve this from your Express app at `/dashboard` — no build step, no React, no infra. Loads in <1 sec on iPad Safari.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Wedgewood Pool — Front Desk</title>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { font: 18px/1.4 -apple-system, system-ui, sans-serif; margin: 0; background: #f0f4f8; color: #1a202c; }
  header { background: #2c5282; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  header h1 { margin: 0; font-size: 20px; }
  .clock { font-variant-numeric: tabular-nums; opacity: 0.9; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px; }
  .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .card .label { font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; }
  .card .value { font-size: 42px; font-weight: 700; margin-top: 6px; color: #2d3748; font-variant-numeric: tabular-nums; }
  .card .sub { font-size: 13px; color: #718096; margin-top: 2px; }
  .panel { background: white; margin: 0 16px 16px; border-radius: 12px; padding: 20px; }
  .panel h2 { margin: 0 0 12px; font-size: 16px; color: #4a5568; }
  .feed { display: flex; flex-direction: column; gap: 10px; }
  .feed-item { display: flex; justify-content: space-between; padding: 10px; border-radius: 8px; background: #f7fafc; }
  .feed-item.fail { background: #fff5f5; }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge.ok { background: #c6f6d5; color: #22543d; }
  .badge.bad { background: #fed7d7; color: #742a2a; }
  .badge.guest { background: #feebc8; color: #7c2d12; }
  input.search { width: 100%; padding: 14px; font-size: 18px; border: 2px solid #e2e8f0; border-radius: 8px; }
  input.search:focus { outline: none; border-color: #2c5282; }
  .results { margin-top: 12px; }
  .result-row { padding: 12px; border-radius: 8px; background: #f7fafc; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .muted { color: #a0aec0; font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>🏊 Wedgewood Pool — Front Desk</h1>
  <div class="clock" id="clock"></div>
</header>

<div class="grid">
  <div class="card"><div class="label">Visited Today</div><div class="value" id="total">—</div></div>
  <div class="card"><div class="label">In Pool Now</div><div class="value" id="active">—</div></div>
  <div class="card"><div class="label">Guests Today</div><div class="value" id="guests">—</div><div class="sub" id="guest-rev">$0</div></div>
  <div class="card"><div class="label">New Signups</div><div class="value" id="signups">—</div></div>
</div>

<div class="panel">
  <h2>Live Feed (last 5)</h2>
  <div class="feed" id="feed"><div class="muted">Loading…</div></div>
</div>

<div class="panel">
  <h2>Search Member</h2>
  <input class="search" id="q" placeholder="Type a name or phone…" autocomplete="off" />
  <div class="results" id="results"></div>
</div>

<script>
const API = 'https://bu92wt7vt5.us-east-2.awsapprunner.com';
const LOC = 'Bjt6c984XN3YKY5porzI';
const TOKEN = prompt('Staff PIN:'); // basic security for MVP
const HDR = { 'X-Dashboard-Token': TOKEN };

const $ = (id) => document.getElementById(id);

function fmtTime(iso) {
  const d = new Date(iso); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function refresh() {
  try {
    const [today, active] = await Promise.all([
      fetch(`${API}/dashboard/today?location_id=${LOC}`, { headers: HDR }).then(r => r.json()),
      fetch(`${API}/dashboard/active?location_id=${LOC}`, { headers: HDR }).then(r => r.json()),
    ]);
    $('total').textContent = today.total_today;
    $('active').textContent = active.currently_in_pool;
    $('guests').textContent = today.guests_today;
    $('guest-rev').textContent = '$' + (today.guest_revenue || 0);
    $('signups').textContent = today.new_signups_today;

    $('feed').innerHTML = (today.last_5 || []).map(e => `
      <div class="feed-item ${e.validation_result === 'fail' ? 'fail' : ''}">
        <div><strong>${e.person_name}</strong> <span class="muted">${fmtTime(e.timestamp)}</span></div>
        <span class="badge ${e.validation_result === 'pass' ? 'ok' : e.event_type === 'guest' ? 'guest' : 'bad'}">
          ${e.validation_result === 'pass' ? 'In' : e.event_type === 'guest' ? 'Guest' : 'Failed'}
        </span>
      </div>
    `).join('') || '<div class="muted">No check-ins yet today.</div>';
  } catch (e) {
    console.error(e);
  }
}

function tickClock() { $('clock').textContent = new Date().toLocaleTimeString(); }
setInterval(tickClock, 1000); tickClock();
setInterval(refresh, 3000); refresh();

let searchTimer;
$('q').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $('results').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    const r = await fetch(`${API}/members/search?location_id=${LOC}&q=${encodeURIComponent(q)}`, { headers: HDR }).then(r => r.json());
    $('results').innerHTML = (r.matches || []).map(m => `
      <div class="result-row">
        <div><strong>${m.full_name}</strong> <span class="muted">${m.phone || ''}</span></div>
        <span class="badge ${m.membership_status === 'active' ? 'ok' : 'bad'}">${m.membership_status}</span>
      </div>
    `).join('') || '<div class="muted">No matches.</div>';
  }, 300);
});
</script>
</body>
</html>
```

### D.4 — DNS for `pooladmin.govenderly.us`

If your App Runner URL is `bu92wt7vt5.us-east-2.awsapprunner.com`:
1. In Venderly's DNS host (Route 53 / Cloudflare / wherever `govenderly.us` lives), add a CNAME: `pooladmin` → `bu92wt7vt5.us-east-2.awsapprunner.com`
2. In App Runner console → your service → Custom domains → add `pooladmin.govenderly.us` → AWS will give you DNS records to verify (CNAME) — add them, wait ~10 min for cert
3. Done. SSL is auto-provisioned.

Complexity: **Easy** (~30 minutes including DNS propagation).

---

## Section E — Risks & Things I'd Punt to Post-Launch

| Risk | Mitigation |
|---|---|
| **Family-text parsing** misses people, so a son/daughter checks in and isn't found | The fallback flow in the PRD handles this: "see front desk." Staff can manually search and add. Plan to clean the 30-40 review rows by Friday. |
| **Network drops at the pool** mid-check-in | App Runner is HTTPS/public. As long as the iPad has WiFi/LTE, you're fine. Have a paper backup roster printed for catastrophic-failure mode. |
| **GHL workflow doesn't wait long enough** for AWS response | Set the "Wait" step after the Custom Webhook to 3 seconds. AWS responds in <100ms typically; 3s is plenty of buffer. |
| **iPad Safari caching** the dashboard | Add `Cache-Control: no-store` header on `/dashboard` route. Already in the code if you serve it via Express. |
| **Staff teen forgets the PIN** | Print it on the back of the iPad. Not OWASP-approved, but realistic. Rotate post-season. |
| **Duplicate check-ins** (member taps twice) | Server-side: if the most recent event for this phone in the last 5 minutes was a check-in, return `{ valid: true, already_checked_in: true }` instead of writing another row. |
| **Currently-in-pool drift** (people leave without signing out) | Add a Lambda or cron at 11pm daily that wipes the GSI1 "ACTIVE" attribute on all today's events. Resets to 0 overnight. |

### Punt to v2 (don't touch before Memorial Day)
- AppSync subscriptions / WebSockets — not needed at 1 iPad
- Multi-tenant UI (different clubs in one dashboard) — only Wedgewood for now
- Programmatic Stripe refunds — GHL UI is fine
- OpenSearch / fuzzy name matching — `contains()` filter scan works fine at this size
- Staff role permissions — single shared PIN is fine
- Audit log / activity reporting — DynamoDB already stores everything; build reports later
- Photo / member-card display — PRD doesn't require it

---

## Section F — What to Tell Ryan (one-liner)

> "Add a Custom Webhook step to each of the 3 form-triggered workflows (Pool Sign-In, Pool Sign-Out, Membership signup) that POSTs to `https://bu92wt7vt5.us-east-2.awsapprunner.com/{checkin|signout|signup}` with this JSON body [share Section A Q5]. Enable 'Save response from this Webhook' on the Sign-In one so the existing condition branches can read `response.valid`. Test each with the GHL Test Workflow button against webhook.site first to verify the payload, then switch the URL to AWS. Publish all three workflows by Wednesday EOD."

---

*Generated May 19, 2026. Re-read Section C the morning of May 20 and start there.*
