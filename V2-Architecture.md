# Wedgewood Swim Club v2 — Architecture & Build Plan

**Authored:** May 25, 2026 (post-Memorial Day reflection)
**Audience:** Amar, Ryan, Aaron
**Context:** v1 shipped and worked for opening weekend. Real usage exposed product gaps and a need for cleaner architecture. This document is the v2 redesign.

---

## TL;DR

Switch from DynamoDB to **PostgreSQL on AWS RDS**. Normalize the data model so **every person is a row** (not just family heads). Build a real **React SPA staff dashboard** instead of a single HTML file. Keep the **GHL webhook integration** and **member-facing confirmation pages** as-is — they work. Engineer the system to be **multi-tenant from day one** so onboarding club #2 is a config change, not a rebuild.

Expected effort: **2-3 weeks** of focused work to build v2 in parallel, then a one-day cutover.

---

## Why Redesign Now (Not "Just Patch")

Three things changed since v1:

1. **You have real data on what staff actually need.** Manual sign-outs are critical. Per-person check-ins matter. Guest pass enforcement is required. None of this was clear before opening day.
2. **Ryan's meeting decisions add complexity v1 can't carry cleanly** — guest pass remaining counts, Stripe SETI for free memberships, per-person family records, 8-member family forms, real-time pass validation.
3. **You want this to scale to multiple swim clubs.** v1's DynamoDB single-table design with location-prefixed partition keys works for 1-3 clubs, breaks down at 10+ for analytics and reporting.

The opposite case — "just patch v1" — leads to:
- 6 months of duct tape on a model that doesn't fit the domain
- Every new feature takes 2-3x longer because the schema fights you
- Onboarding club #2 reveals the foundation isn't multi-tenant

**Verdict:** Redesign. Now. With v1 still running production for Wedgewood, no pressure on the rebuild timeline.

---

## v2 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Database** | PostgreSQL 15+ on AWS RDS | Relational data fits this domain perfectly (memberships → persons → events → payments). SQL JOINs replace 5 DynamoDB GSIs. Free tier covers small clubs. Easy to back up, easy to query for ad-hoc reports. |
| **Backend** | Node.js + Express + TypeScript | Keeps your existing skill set. TypeScript catches whole classes of bugs that bit v1. Express is boring and proven. |
| **ORM** | Prisma | Generates type-safe queries from the schema. Auto-handles migrations. Has Studio for browsing data — replaces the manual DynamoDB console clicking. |
| **Validation** | Zod | Schema validation for every API endpoint. Catches malformed webhook payloads at the boundary. |
| **Real-time** | Server-Sent Events (SSE) + Postgres LISTEN/NOTIFY | Simpler than WebSockets, cheaper than AppSync, perfectly fits a one-way push (server → dashboard). Falls back to polling. |
| **Frontend (Staff)** | React 18 + Vite + TypeScript + Tailwind + TanStack Query + shadcn/ui | Modern, lightweight, ships in <50KB gzipped. shadcn/ui gives you professional components without a heavy framework. |
| **Member-facing pages** | Keep current server-rendered HTML | /welcome, /goodbye, /signed-up already work well. Don't touch. |
| **Auth (Staff)** | JWT + refresh tokens, PIN remains the credential | Per-staff PINs (each lifeguard has their own) for audit trail. Manager has higher-tier PIN. |
| **Hosting (API)** | AWS App Runner (keep current) | Already deployed. Container-based. Scales to zero. |
| **Hosting (Frontend)** | AWS S3 + CloudFront | Static SPA, fast global delivery. Versioned deploys for easy rollback. |
| **Hosting (DB)** | AWS RDS Postgres, db.t4g.micro | $15-25/month for small clubs. Multi-AZ optional for production. |
| **Payments** | Stripe via GHL (unchanged) | GHL handles the Stripe Connect plumbing. Backend reads payment metadata from webhooks. |
| **Logs** | CloudWatch | Already in place. |
| **CI/CD** | GitHub Actions | Push to main → tests run → if green, deploy to App Runner + S3. |

---

## Multi-Tenancy Model

**Decision: Shared database, tenant_id column on every table.**

- Each swim club is a `club` row in the `clubs` table with a unique `ghl_location_id` (existing) and `stripe_connect_id`.
- Every other table (persons, memberships, events, etc.) has a `club_id` foreign key.
- Every API endpoint scopes by `club_id` from the JWT or URL path.
- A single Postgres instance can serve **dozens of clubs** before any sharding is needed.

When a club needs physical isolation (rare — usually compliance-driven), spin up a dedicated DB for them. Don't pre-build for this case.

---

## Database Schema (Postgres)

### `clubs` — tenant config

```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,                           -- 'wedgewood'
  ghl_location_id TEXT UNIQUE NOT NULL,                -- 'Bjt6c984XN3YKY5porzI'
  stripe_connect_account_id TEXT,
  domain TEXT,                                         -- 'pooladmin.govenderly.us'
  timezone TEXT DEFAULT 'America/New_York',
  pool_capacity INT DEFAULT 80,
  guest_pass_price_cents INT DEFAULT 1000,             -- $10.00
  free_pass_grandfather_date DATE,                     -- '2026-05-01' for Wedgewood
  free_passes_for_grandfathered INT DEFAULT 5,
  season_start DATE,
  season_end DATE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `memberships` — a paid plan, attached to a primary person

```sql
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,                                  -- 'family', 'adult_single', 'student', etc.
  status TEXT NOT NULL DEFAULT 'active',               -- 'active', 'expired', 'suspended', 'free_gift'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  stripe_customer_id TEXT,
  stripe_payment_intent_id TEXT,                       -- 'pi_xxx' for normal payments
  stripe_setup_intent_id TEXT,                         -- 'seti_xxx' for free gift memberships
  payment_status TEXT NOT NULL,                        -- 'paid', 'pending', 'free_gift', 'refunded'
  payment_amount_cents INT NOT NULL DEFAULT 0,
  guest_passes_total INT NOT NULL DEFAULT 0,           -- total earned + purchased
  guest_passes_used INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL,                                -- 'ghl_signup', 'csv_import', 'manual'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memberships_club_status ON memberships(club_id, status);
CREATE INDEX idx_memberships_stripe_pi ON memberships(stripe_payment_intent_id);
CREATE INDEX idx_memberships_stripe_seti ON memberships(stripe_setup_intent_id);
```

### `persons` — every individual is a row

```sql
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,                                          -- nullable (kids may not have email)
  phone TEXT,                                          -- E.164 format, nullable
  age INT,
  date_of_birth DATE,
  relationship TEXT NOT NULL,                          -- 'self', 'spouse', 'child', 'parent', 'other'
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  ghl_contact_id TEXT,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_primary_per_membership UNIQUE (membership_id, is_primary) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_persons_club_email ON persons(club_id, LOWER(email));
CREATE INDEX idx_persons_club_phone ON persons(club_id, phone);
CREATE INDEX idx_persons_club_name ON persons(club_id, LOWER(first_name), LOWER(last_name));
CREATE INDEX idx_persons_membership ON persons(membership_id);
```

### `checkin_events` — every check-in / sign-out

```sql
CREATE TABLE checkin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  person_id UUID REFERENCES persons(id),               -- nullable for standalone guests
  membership_id UUID REFERENCES memberships(id),       -- attribution
  event_type TEXT NOT NULL,                            -- 'check_in', 'sign_out', 'auto_eod_signout'
  source TEXT NOT NULL,                                -- 'qr_form', 'manual_dashboard', 'admin_reset'
  num_guests INT NOT NULL DEFAULT 0,
  guest_payment_cents INT NOT NULL DEFAULT 0,          -- charged if purchased
  guest_passes_used INT NOT NULL DEFAULT 0,            -- if pre-paid passes consumed
  is_active BOOLEAN NOT NULL DEFAULT TRUE,             -- false after sign-out
  performed_by_staff_id UUID REFERENCES staff(id),     -- null if self-service via QR
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_out_at TIMESTAMPTZ
);

CREATE INDEX idx_events_club_active ON checkin_events(club_id, is_active);
CREATE INDEX idx_events_club_date ON checkin_events(club_id, created_at);
CREATE INDEX idx_events_person ON checkin_events(person_id);
```

### `guest_pass_purchases` — audit trail (Stripe-linked)

Per Ryan: guest passes are a Stripe product. Each purchase/grant is reconciled with Stripe's product inventory.

```sql
CREATE TABLE guest_pass_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  membership_id UUID NOT NULL REFERENCES memberships(id),
  passes_purchased INT NOT NULL,
  amount_cents INT NOT NULL,
  stripe_payment_intent_id TEXT,                       -- 'pi_xxx' for normal purchases
  stripe_product_id TEXT,                              -- Stripe product SKU (Ryan's setup)
  stripe_price_id TEXT,                                -- the specific price tier used
  granted_via TEXT NOT NULL,                           -- 'grandfather', 'purchase', 'manual_gift'
  purchased_via TEXT,                                  -- 'welcome_page', 'website', 'staff_dashboard'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Also add Stripe reference to memberships for ongoing pass tracking:

```sql
ALTER TABLE memberships
  ADD COLUMN stripe_guest_pass_product_id TEXT;       -- the SKU representing their pass inventory
```

### `staff` — per-staff accounts

```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'lifeguard',              -- 'lifeguard', 'manager', 'admin'
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_club_active ON staff(club_id, active);
```

### `audit_log` — every state-changing action

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id),
  actor_type TEXT NOT NULL,                            -- 'staff', 'member', 'ghl_webhook', 'system'
  actor_id TEXT,
  action TEXT NOT NULL,                                -- 'check_in', 'sign_out', 'membership_created', etc.
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_club_date ON audit_log(club_id, created_at DESC);
```

---

## API Design

REST + JSON. Versioned at `/api/v1/`. Multi-tenant scoped by `club_id` in the URL.

### Public (no auth — called by GHL webhooks)

```
POST /api/v1/clubs/:clubId/webhooks/checkin
POST /api/v1/clubs/:clubId/webhooks/signout
POST /api/v1/clubs/:clubId/webhooks/membership-payment
POST /api/v1/clubs/:clubId/webhooks/guest-pass-purchase
```

All webhooks require `X-Webhook-Secret` header matching the club's configured secret.

### Public (no auth — member-facing pages)

```
GET /welcome?club=wedgewood&email=...
GET /goodbye?club=wedgewood&email=...
GET /signed-up?club=wedgewood&email=...
GET /buy-passes?club=wedgewood&email=...      # NEW — buy more guest passes
```

These do DB lookups, render HTML.

### Staff API (requires JWT)

```
# Auth
POST /api/v1/auth/login                              # { club_slug, pin } → { token, refresh_token, staff }
POST /api/v1/auth/refresh                            # { refresh_token } → new token

# Dashboard
GET  /api/v1/clubs/:clubId/dashboard/summary         # counts, revenue, capacity
GET  /api/v1/clubs/:clubId/dashboard/active          # currently in pool, sums attendees
GET  /api/v1/clubs/:clubId/dashboard/recent          # last N events with details
GET  /api/v1/clubs/:clubId/dashboard/signups-today

# Members
GET  /api/v1/clubs/:clubId/persons                   # paginated list with filters
GET  /api/v1/clubs/:clubId/persons/search?q=...      # ranked fuzzy search
GET  /api/v1/clubs/:clubId/persons/:id               # full detail incl family + history
PATCH /api/v1/clubs/:clubId/persons/:id              # edit (manager+)

# Memberships
GET  /api/v1/clubs/:clubId/memberships/:id           # full detail
PATCH /api/v1/clubs/:clubId/memberships/:id          # edit (manager+)

# Check-ins
POST /api/v1/clubs/:clubId/checkin/manual            # staff-initiated
POST /api/v1/clubs/:clubId/signout/manual            # staff-initiated
POST /api/v1/clubs/:clubId/admin/reset-active        # daily reset

# Events stream (real-time)
GET  /api/v1/clubs/:clubId/events/stream             # SSE endpoint

# Reports (manager+)
GET  /api/v1/clubs/:clubId/reports/revenue?from=...&to=...
GET  /api/v1/clubs/:clubId/reports/attendance?date=...
GET  /api/v1/clubs/:clubId/reports/guest-passes?from=...&to=...
```

---

## Handling Each New Requirement

### 1. Per-person check-in (Ryan's individual member request)

**Problem in v1:** Tyler can't check in alone — only Kelly's email works.

**Solution in v2:** Every family member is a `persons` row with their own `email` (when known), `phone`, and `first_name`. Check-in lookup:
1. Query `persons` by email → match.
2. Fallback: query by phone.
3. Fallback: query by `first_name + last_name` within a known `membership_id` (when "Membership Name" field is provided).
4. None match → "not found" → red welcome page.

Dashboard shows Tyler's name specifically when he checks in, not "Kelly's family."

### 2. Guest passes (0-5 dropdown + remaining count + Buy More)

**Form (Ryan's side):**
- Sign-In form: "Number of guests" dropdown 0-5
- After member selects 1+: "Use my passes" vs "Pay $10 per guest" radio
- Backend reads `numGuests` and `guestPaymentMode`

**Backend logic on check-in:**
```
1. Compute remaining_passes = membership.guest_passes_total - membership.guest_passes_used
2. If guestPaymentMode = "use_passes":
   - If remaining_passes >= numGuests: decrement guest_passes_used by numGuests
   - Else: reject with "Not enough passes" — fall through to pay
3. If guestPaymentMode = "pay": expect Stripe payment of numGuests × $10
4. Log to guest_pass_purchases or checkin_events
```

**Welcome page (member-facing):**
- "Welcome [Name]! 3 guest passes remaining."
- Button: "Buy more passes →" → /buy-passes page with Stripe checkout

### 3. Stripe SETI for free memberships

**The detection logic:**

```javascript
// In webhooks/membership-payment.js
const paymentId = req.body.payment_id;

if (paymentId?.startsWith('seti_')) {
  // Free membership via 100% coupon
  await db.memberships.create({
    payment_status: 'free_gift',
    stripe_setup_intent_id: paymentId,
    payment_amount_cents: 0,
    ...rest
  });
} else if (paymentId?.startsWith('pi_')) {
  // Normal paid membership
  await db.memberships.create({
    payment_status: 'paid',
    stripe_payment_intent_id: paymentId,
    payment_amount_cents: amount,
    ...rest
  });
}
```

Both create the membership. The DB record cleanly tracks how each was funded.

### 4. Pre-May-1 grandfathered free passes

**On import (one-time migration):**
```sql
UPDATE memberships
SET guest_passes_total = guest_passes_total + (
  SELECT free_passes_for_grandfathered FROM clubs WHERE id = memberships.club_id
)
WHERE memberships.club_id = $clubId
  AND memberships.created_at < (SELECT free_pass_grandfather_date FROM clubs WHERE id = $clubId);
```

**Future signups:** If signup happens after `free_pass_grandfather_date`, `guest_passes_total = 0` (or whatever default the tier specifies).

### 5. 8-member family forms (Ryan's v2 form ready)

**Form has fields:** `1st Member Full Name + Phone + Age`, through `7th Member`.

**Backend signup handler:**
```javascript
const familyMembers = [];
for (let i = 1; i <= 7; i++) {
  const name = req.body[`${ordinal(i)}MemberFullName`];
  if (!name) break;
  familyMembers.push({
    name,
    phone: req.body[`${ordinal(i)}MemberPhone`],
    age: parseInt(req.body[`${ordinal(i)}MemberAge`]),
  });
}

// Create membership
const membership = await db.memberships.create(...);

// Create primary person
await db.persons.create({ ...primary, is_primary: true, membership_id });

// Create each family member
for (const m of familyMembers) {
  await db.persons.create({
    first_name: m.name.split(' ')[0],
    last_name: m.name.split(' ').slice(1).join(' '),
    phone: normalizePhone(m.phone),
    age: m.age,
    relationship: inferRelationship(m.age, primary.age),
    is_primary: false,
    membership_id,
  });
}
```

### 6. Multi-tenant ready

Every API endpoint takes `clubId` from URL. Every DB query filters by `club_id`. New club onboarding is:
1. INSERT INTO clubs (...) VALUES (...);
2. Configure their GHL location_id and Stripe Connect.
3. Done. Dashboard becomes available at `pooladmin.govenderly.us/[club-slug]/dashboard`.

---

## Frontend (Staff Dashboard) — React SPA

### Pages

```
/login                                    PIN entry
/[club-slug]/dashboard                    Main dashboard (real-time)
/[club-slug]/members                      Full member list with search/filter
/[club-slug]/members/:id                  Member detail with edit
/[club-slug]/memberships/:id              Membership detail (family, payment, passes)
/[club-slug]/events                       Today's events log (all check-ins/outs)
/[club-slug]/reports                      Revenue, attendance, passes (manager+)
/[club-slug]/settings                     Club config (admin only)
```

### Component library

`shadcn/ui` (Radix UI + Tailwind). Battle-tested, accessible, beautiful by default. Pre-built components:
- `<DataTable>` for member lists with sorting and filtering
- `<Sheet>` (slide-over) for member details
- `<Dialog>` for confirmations
- `<Toast>` for action feedback
- `<Tabs>` for sub-views
- `<Form>` with react-hook-form integration

### Real-time updates

```javascript
// Dashboard component
const eventSource = new EventSource(`/api/v1/clubs/${clubId}/events/stream`, {
  withCredentials: true
});
eventSource.addEventListener('check_in', (e) => {
  const event = JSON.parse(e.data);
  toast.success(`👋 ${event.person.first_name} checked in!`);
  // Optimistically update local cache
  queryClient.invalidateQueries(['dashboard']);
});
```

Backend pushes via SSE whenever a row is INSERTed into checkin_events (via Postgres LISTEN/NOTIFY trigger).

---

## Data Migration from v1 → v2

### Phase 1 — One-time CSV normalization

For your uploaded CSV with 99 paid members:

```python
# Pseudocode
for row in csv_rows:
    # Create membership
    membership = create_membership(
        club_id=wedgewood_id,
        tier=infer_tier(row['payment_amount']),
        payment_status='paid',
        payment_amount_cents=parse_amount(row['payment_amount']),
        guest_passes_total=5 if parse_date(row['submission_date']) < '2026-05-01' else 0,
        start_date='2026-05-24',
        end_date='2026-09-30',
    )
    
    # Create primary person
    create_person(
        membership_id=membership.id,
        is_primary=True,
        first_name=row['full_name'].split(' ')[0],
        last_name=row['full_name'].split(' ', 1)[1],
        email=row['email'],
        phone=normalize(row['phone']),
        relationship='self',
    )
    
    # Parse family members from messy text
    family_members = parse_family_text(row['family_relationships'])
    phones = parse_phones(row['all_phones'])
    emails = parse_emails(row['all_emails'])
    
    for i, fm in enumerate(family_members):
        create_person(
            membership_id=membership.id,
            is_primary=False,
            first_name=fm.name.split(' ')[0],
            last_name=fm.name.split(' ', 1)[1] if ' ' in fm.name else '',
            phone=phones[i+1] if i+1 < len(phones) else None,
            email=emails[i+1] if i+1 < len(emails) else None,
            relationship=fm.relationship or 'unknown',
            age=fm.age,
        )
```

For the 30-40 rows where family text is ambiguous → output `needs-review.csv`, manual cleanup in Postgres after import.

### Phase 2 — Dual-write

For the first week of v2 in production, write to BOTH DynamoDB and Postgres on every webhook. Compare counts daily. If they match, cut over.

### Phase 3 — Cutover

- Switch GHL webhooks to v2 URLs
- Decommission DynamoDB tables (keep export for 30 days as backup)

---

## Build Timeline

**Week 1: Foundation (now)**
- Set up Postgres on RDS
- Define schema in Prisma
- Build CSV normalization script + run on Wedgewood data
- Verify counts match

**Week 2: Backend**
- Webhook endpoints (checkin, signout, membership-payment, guest-pass-purchase)
- Dashboard API endpoints
- Staff auth with JWT
- SSE event stream
- Audit logging

**Week 3: Frontend + Cutover**
- React SPA scaffolded with Vite + shadcn/ui
- Dashboard, member list, member detail pages
- Real-time events via SSE
- Dual-write period
- Cutover

**Week 4 (optional): Polish + Phase 2 features**
- Manager reports view
- Photo uploads
- Bulk operations (close pool for weather, etc.)

---

## What You Asked About Specifically

### "Should I use API calls instead of database?"

**You need both.** The database stores data. The API exposes the database to the frontend. Frontend never talks to the database directly (that would be a security hole). Frontend talks to API → API talks to database.

The question you might mean: "should I use third-party APIs (like Airtable, Notion, Google Sheets) instead of running my own database?" Answer: **no for this product.** Custom queries, audit requirements, multi-tenancy, real-time updates, and Stripe integration all push toward a real database. Third-party tools are too slow and rigid.

### "Should I normalize the CSV data?"

**Yes — that's exactly what the v2 schema requires.** Every person becomes a row in `persons`. Family relationships become a `membership_id` foreign key. Messy free-text becomes structured fields. The normalization script handles 80% automatically; 20% needs manual review.

### "Best practice / 10 years experience"

What a senior engineer would do differently from v1:
1. **Start with a real schema** (Postgres) instead of "we'll figure it out" key-value
2. **TypeScript everywhere** — catches whole bug classes
3. **Validation at every API boundary** (Zod) — never trust webhook payloads
4. **Audit log table** for every state change — debugging gets 10x easier
5. **Real frontend framework** for the staff dashboard — easier to iterate
6. **CI/CD with tests** — every push runs tests, deploys on green
7. **Infrastructure as Code** — Terraform/Pulumi so onboarding club #2 is a config change
8. **Logs and metrics from day one** — CloudWatch dashboards, alarms on errors

---

## Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| Migration introduces bugs that break Wedgewood | Run v1 in parallel for a week. Dual-write to both DBs. Only cut over after counts match. |
| v2 takes longer than estimated | Build incrementally. Webhooks first (highest value), dashboard last (lower risk). |
| Onboarding 2nd club reveals hidden assumptions | Mitigated by building multi-tenant from day one. |
| React frontend is overkill for one club | Yes for one club, perfect for ten. We're building for scale. |
| Postgres costs more than DynamoDB | True — $15-25/month vs $0. Worth it for relational queries, ad-hoc reporting, and easier debugging. |

---

## Decisions That Need to Be Made

Before starting v2 build:

1. **Are you OK with 2-3 weeks of v1 staying in production while v2 is built?**
2. **Are you OK with Postgres costs (~$25/mo per club at small scale)?**
3. **Are you OK with TypeScript everywhere (steeper learning curve, fewer bugs)?**
4. **React SPA or stay with single HTML file?** (Recommended: SPA. But single HTML file works too — slower to iterate.)
5. **Build with Prisma ORM or raw SQL?** (Recommended: Prisma.)

---

## Open Questions for Ryan

1. Confirm the **8-member family form v2** is ready to publish — share the URL.
2. Confirm the **guest pass price** ($10/pass) and whether it changes by tier or club.
3. Confirm the **pool capacity** for Wedgewood (we've been guessing 80).
4. Are **child accounts under 13 expected to have email/phone**, or always blank?
5. **Stripe SETI handling** — should staff be able to see "free gift" memberships separately on the dashboard? (My recommendation: yes, with a small badge.)
6. **Manager vs Lifeguard permissions** — what should each role see/not see?

---

*This is a redesign document, not a finished build. Next step: review with Ryan/Aaron, get sign-off on architecture, then start with Week 1 (schema + migration script). I recommend keeping v1 running until v2 has been verified against real data.*
