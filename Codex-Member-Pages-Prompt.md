# Codex Prompt — Member-Facing HTML Pages (Express Routes)

Member-facing confirmation pages that members see on their phone after submitting GHL forms. These are SERVER-RENDERED HTML (not React, not part of the staff dashboard). Members never see the staff app.

Paste this prompt into Codex in the v2 backend repo.

---

## PROMPT FOR CODEX

```
Build three server-rendered HTML pages that members see on their phone 
after submitting GHL forms. These are Express routes that return styled 
HTML directly — no React, no client framework, no build step.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

After GHL fires a webhook to our backend, the GHL form's redirect URL 
sends the member's browser to one of these three pages with query 
params. Our route reads the params, looks up additional context from 
DB if needed, and returns a beautiful confirmation page.

These pages run on mobile (member's phone) in bright sunlight at the 
pool gate. They must be readable, fast, friendly.

═══════════════════════════════════════════════════════════════
ROUTES TO ADD
═══════════════════════════════════════════════════════════════

Add to src/server.ts (or wherever public routes live):

  app.get('/welcome', welcomeHandler);    // after pool sign-in
  app.get('/goodbye', goodbyeHandler);    // after pool sign-out
  app.get('/signed-up', signedUpHandler); // after new membership payment

All routes are PUBLIC (no auth). Set headers:
  Cache-Control: no-store
  X-Content-Type-Options: nosniff

Handler file: src/handlers/memberPages.ts

═══════════════════════════════════════════════════════════════
FILE STRUCTURE
═══════════════════════════════════════════════════════════════

src/
  handlers/
    memberPages.ts        ← three handler functions
  templates/
    layout.ts             ← shared HTML scaffold (head, body, footer)
    welcome.ts            ← /welcome states + content
    goodbye.ts            ← /goodbye states + content
    signedUp.ts           ← /signed-up states + content
    styles.ts             ← shared CSS as a string (inlined into <style>)

═══════════════════════════════════════════════════════════════
SHARED HTML LAYOUT (src/templates/layout.ts)
═══════════════════════════════════════════════════════════════

export function renderLayout(opts: {
  title: string;
  body: string;
  autoRedirectSeconds?: number;
  redirectUrl?: string;
}): string {
  const redirectMeta = opts.autoRedirectSeconds && opts.redirectUrl
    ? `<meta http-equiv="refresh" content="${opts.autoRedirectSeconds}; url=${opts.redirectUrl}">`
    : '';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="theme-color" content="#2196F3">
  <title>${escapeHtml(opts.title)} · Wedgewood Swim Club</title>
  ${redirectMeta}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="header">
      <img src="https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png" 
           alt="Wedgewood Swim Club" class="logo">
    </header>
    <main class="main">
      ${opts.body}
    </main>
    <footer class="footer">
      <p>Wedgewood Swim Club · 2A Wedgefield Drive, New Castle, DE</p>
      <p class="footer-meta">Powered by Venderly</p>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]!));
}

═══════════════════════════════════════════════════════════════
SHARED CSS (src/templates/styles.ts) — Inlined
═══════════════════════════════════════════════════════════════

export const SHARED_STYLES = `
:root {
  /* Wedgewood brand */
  --teal-500: #2196F3;
  --teal-600: #1E88E5;
  --teal-700: #1976D2;
  --navy-700: #1B3A5C;
  --navy-900: #0F1B2D;
  --aqua-50: #F0F7FA;
  --green-50: #E8F5E9;
  --green-500: #2E7D32;
  --green-700: #1B5E20;
  --yellow-50: #FFF8E1;
  --yellow-500: #F9A825;
  --yellow-700: #F57F17;
  --red-50: #FEE2E2;
  --red-500: #D32F2F;
  --red-700: #B71C1C;
  --gray-200: #EEEEEE;
  --gray-500: #9E9E9E;
  --gray-700: #616161;
  --white: #FFFFFF;
}

* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  background: linear-gradient(180deg, var(--aqua-50) 0%, var(--white) 100%);
  color: var(--navy-900);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 24px;
}

.header {
  padding: 32px 0 24px;
  text-align: center;
}

.logo {
  height: 48px;
  width: auto;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px 0;
}

.card {
  background: var(--white);
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 8px 24px -4px rgba(27, 58, 92, 0.12);
  text-align: center;
  animation: fadeIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  animation: iconPop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms backwards;
}

.icon-circle.success {
  background: var(--green-50);
  color: var(--green-500);
}

.icon-circle.warning {
  background: var(--yellow-50);
  color: var(--yellow-700);
}

.icon-circle.danger {
  background: var(--red-50);
  color: var(--red-700);
}

.icon-circle.info {
  background: var(--aqua-50);
  color: var(--teal-700);
}

.icon-circle svg {
  width: 40px;
  height: 40px;
}

h1.headline {
  font-size: 28px;
  font-weight: 700;
  line-height: 36px;
  margin-bottom: 12px;
  color: var(--navy-900);
}

p.subline {
  font-size: 18px;
  font-weight: 400;
  line-height: 28px;
  color: var(--gray-700);
  margin-bottom: 24px;
}

.info-block {
  background: var(--aqua-50);
  border-radius: 12px;
  padding: 20px;
  margin: 24px 0;
  text-align: left;
}

.info-block .label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.info-block .value {
  font-size: 16px;
  font-weight: 500;
  color: var(--navy-900);
}

.info-block + .info-block { margin-top: 12px; }

.family-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}

.family-list li {
  padding: 8px 0;
  border-top: 1px solid var(--gray-200);
  font-size: 14px;
  color: var(--gray-700);
}

.family-list li:first-child {
  border-top: none;
  padding-top: 0;
}

.button {
  display: inline-block;
  padding: 14px 28px;
  background: var(--teal-500);
  color: var(--white);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  margin-top: 8px;
  min-height: 48px;
  transition: background 150ms ease;
}

.button:hover, .button:active {
  background: var(--teal-600);
}

.button.secondary {
  background: var(--white);
  color: var(--teal-700);
  border: 2px solid var(--teal-500);
}

.button-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.countdown {
  font-size: 14px;
  color: var(--gray-500);
  margin-top: 16px;
}

.footer {
  padding: 24px 0 32px;
  text-align: center;
  color: var(--gray-500);
  font-size: 13px;
  line-height: 1.5;
}

.footer-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--gray-500);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes iconPop {
  0% { opacity: 0; transform: scale(0); }
  60% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

.icon-circle.success svg { animation: drawCheck 600ms ease-out 700ms backwards; }

@keyframes drawCheck {
  from { stroke-dasharray: 0 100; }
  to { stroke-dasharray: 100 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    transition-duration: 0ms !important;
  }
}

@media (max-width: 380px) {
  .card { padding: 32px 24px; }
  h1.headline { font-size: 24px; line-height: 32px; }
  p.subline { font-size: 16px; line-height: 24px; }
}
`;

═══════════════════════════════════════════════════════════════
HANDLER: /welcome (src/handlers/memberPages.ts)
═══════════════════════════════════════════════════════════════

After Pool Sign-In form submission. GHL redirect URL:
/welcome?status=success&name=Lisa&tier=Family&passes=3&family_in_pool=2

Query params:
  status: 'success' | 'already_checked_in' | 'not_found' | 'at_capacity'
  name: string (member first name)
  tier?: string
  passes?: string (number, guest passes remaining)
  family_in_pool?: string (count of family members currently in pool)
  current_pool_count?: string
  capacity?: string

import { Request, Response } from 'express';
import { renderLayout } from '../templates/layout';

export async function welcomeHandler(req: Request, res: Response) {
  const status = String(req.query.status || 'success');
  const name = String(req.query.name || 'Member');
  const tier = String(req.query.tier || '');
  const passes = req.query.passes ? Number(req.query.passes) : null;
  const familyInPool = req.query.family_in_pool ? Number(req.query.family_in_pool) : 0;
  
  let body = '';
  let title = 'Welcome';
  
  if (status === 'success') {
    body = `
      <div class="card">
        <div class="icon-circle success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 class="headline">Welcome, ${escapeHtml(name)}! 🏊</h1>
        <p class="subline">You're checked in. Have a great swim!</p>
        ${tier ? `
          <div class="info-block">
            <div class="label">Your membership</div>
            <div class="value">${escapeHtml(tier)}</div>
          </div>` : ''}
        ${passes !== null ? `
          <div class="info-block">
            <div class="label">Guest passes remaining</div>
            <div class="value">${passes} ${passes === 1 ? 'pass' : 'passes'}</div>
          </div>` : ''}
        ${familyInPool > 0 ? `
          <div class="info-block">
            <div class="label">Family in pool</div>
            <div class="value">${familyInPool} family ${familyInPool === 1 ? 'member' : 'members'} already swimming</div>
          </div>` : ''}
        <p class="countdown">Returning to the pool gate in 10 seconds…</p>
      </div>`;
    title = 'Welcome ' + name;
  } else if (status === 'already_checked_in') {
    body = `
      <div class="card">
        <div class="icon-circle warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">You're already checked in</h1>
        <p class="subline">Looks like ${escapeHtml(name)} is already in our system as checked-in. Have a great swim!</p>
        <div class="info-block">
          <div class="label">If this looks wrong</div>
          <div class="value">Please see the staff at the front desk for help.</div>
        </div>
      </div>`;
    title = 'Already checked in';
  } else if (status === 'not_found') {
    body = `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h1 class="headline">We couldn't find your membership</h1>
        <p class="subline">No worries — please head to the front desk and staff will help you sort it out.</p>
        <div class="button-row">
          <a href="https://wedgewoodpool.com/memberships" class="button">Sign up for a membership</a>
          <a href="https://wedgewoodpool.com/pool-sign-in" class="button secondary">Back to sign in</a>
        </div>
      </div>`;
    title = 'Not found';
  } else if (status === 'at_capacity') {
    body = `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h1 class="headline">Pool is at capacity right now</h1>
        <p class="subline">The pool is currently full. Please wait a few minutes or see staff for help.</p>
        <p class="countdown">We'll re-check in 30 seconds…</p>
      </div>`;
    title = 'At capacity';
    // Auto-refresh every 30s in this state
    res.setHeader('Refresh', '30');
  }
  
  const autoRedirect = status === 'success'
    ? { autoRedirectSeconds: 10, redirectUrl: 'https://wedgewoodpool.com/pool-sign-in' }
    : {};
  
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderLayout({ title, body, ...autoRedirect }));
}

═══════════════════════════════════════════════════════════════
HANDLER: /goodbye
═══════════════════════════════════════════════════════════════

After Pool Sign-Out form. GHL redirect:
/goodbye?status=success&name=Lisa&duration=127

Query params:
  status: 'success' | 'not_checked_in'
  name: string
  duration?: string (minutes spent at pool today)

export async function goodbyeHandler(req: Request, res: Response) {
  const status = String(req.query.status || 'success');
  const name = String(req.query.name || 'Member');
  const durationMins = req.query.duration ? Number(req.query.duration) : null;
  
  let body = '';
  let title = 'See you soon';
  
  if (status === 'success') {
    const durationText = durationMins
      ? formatDuration(durationMins)
      : null;
    
    body = `
      <div class="card">
        <div class="icon-circle info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z"/>
            <path d="M12 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z"/>
          </svg>
        </div>
        <h1 class="headline">See you next time, ${escapeHtml(name)}! 👋</h1>
        <p class="subline">Thanks for visiting Wedgewood today.</p>
        ${durationText ? `
          <div class="info-block">
            <div class="label">You were here for</div>
            <div class="value">${durationText}</div>
          </div>` : ''}
        <p class="countdown">Have a great rest of your day.</p>
      </div>`;
    title = 'See you ' + name;
  } else if (status === 'not_checked_in') {
    body = `
      <div class="card">
        <div class="icon-circle warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">No active check-in found</h1>
        <p class="subline">We don't have a record of you checking in today. If you think this is a mistake, please see the staff.</p>
        <div class="button-row">
          <a href="https://wedgewoodpool.com/pool-sign-in" class="button">Sign in now</a>
        </div>
      </div>`;
    title = 'No check-in found';
  }
  
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderLayout({ title, body }));
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${remainingMins}m`;
}

═══════════════════════════════════════════════════════════════
HANDLER: /signed-up
═══════════════════════════════════════════════════════════════

After new membership signup payment. GHL redirect:
/signed-up?status=success&name=Melissa&tier=Family&family_members=Jason,Tyler,Chase&passes=5

Query params:
  status: 'success' | 'error'
  name: string
  tier?: string
  family_members?: string (comma-separated names)
  passes?: string (initial guest passes)
  email?: string (contact email for support)

export async function signedUpHandler(req: Request, res: Response) {
  const status = String(req.query.status || 'success');
  const name = String(req.query.name || 'Member');
  const tier = String(req.query.tier || '');
  const familyMembers = req.query.family_members 
    ? String(req.query.family_members).split(',').filter(Boolean)
    : [];
  const passes = req.query.passes ? Number(req.query.passes) : null;
  
  let body = '';
  let title = 'Welcome to Wedgewood';
  
  if (status === 'success') {
    body = `
      <div class="card">
        <div class="confetti">${renderConfetti()}</div>
        <div class="icon-circle success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 class="headline">Welcome to Wedgewood, ${escapeHtml(name)}! 🎉</h1>
        <p class="subline">Your membership is active. See you at the pool!</p>
        ${tier ? `
          <div class="info-block">
            <div class="label">Membership type</div>
            <div class="value">${escapeHtml(tier)}</div>
          </div>` : ''}
        ${familyMembers.length > 0 ? `
          <div class="info-block">
            <div class="label">Members on this membership</div>
            <ul class="family-list">
              ${familyMembers.map(m => `<li>${escapeHtml(m.trim())}</li>`).join('')}
            </ul>
          </div>` : ''}
        ${passes !== null && passes > 0 ? `
          <div class="info-block">
            <div class="label">Guest passes included</div>
            <div class="value">${passes} ${passes === 1 ? 'pass' : 'passes'} ready to use</div>
          </div>` : ''}
        <div class="info-block">
          <div class="label">Pool opens</div>
          <div class="value">Memorial Day Weekend</div>
        </div>
        <div class="button-row">
          <a href="https://wedgewoodpool.com" class="button">Visit pool website</a>
          <a href="https://wedgewoodpool.com/pool-rules" class="button secondary">Pool rules & hours</a>
        </div>
        <p class="countdown" style="margin-top:24px;">Watch your email for confirmation details.</p>
      </div>`;
    title = 'Welcome ' + name;
  } else {
    const email = String(req.query.email || '');
    body = `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">Something went wrong</h1>
        <p class="subline">We received your form but ran into an issue creating your membership. Don't worry — we'll sort it out.</p>
        <div class="info-block">
          <div class="label">What to do</div>
          <div class="value">Please contact us${email ? ` at <a href="mailto:${escapeHtml(email)}" style="color:var(--teal-700)">${escapeHtml(email)}</a>` : ''} and we'll resolve this within 24 hours.</div>
        </div>
      </div>`;
    title = 'Signup issue';
  }
  
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderLayout({ title, body }));
}

function renderConfetti(): string {
  // 12 small SVG confetti pieces, absolutely positioned, randomized colors,
  // animated with CSS to fall + rotate over 2s. Add this CSS to the shared 
  // styles file:
  //
  // .confetti { position: absolute; top: 0; left: 0; right: 0; height: 80px; 
  //             pointer-events: none; overflow: hidden; }
  // .confetti i { position: absolute; width: 10px; height: 14px; opacity: 0;
  //               animation: confettiFall 2s ease-out forwards; }
  // @keyframes confettiFall {
  //   0% { transform: translateY(-40px) rotate(0deg); opacity: 1; }
  //   100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
  // }
  //
  const colors = ['#2196F3', '#1976D2', '#42A5F5', '#F9A825', '#2E7D32'];
  const pieces = Array.from({ length: 12 }, (_, i) => {
    const left = (i * 8) + Math.random() * 4;
    const color = colors[i % colors.length];
    const delay = Math.random() * 0.4;
    return `<i style="left:${left}%; background:${color}; animation-delay:${delay}s;"></i>`;
  });
  return pieces.join('');
}

═══════════════════════════════════════════════════════════════
GHL WORKFLOW INTEGRATION
═══════════════════════════════════════════════════════════════

In each GHL form's redirect setting, point to the appropriate URL with 
the right query params. Example for Pool Sign-In form's redirect after 
the workflow's Custom Webhook saves the AWS response:

Success case:
  https://api.yourdomain.com/welcome?
    status=success&
    name={{contact.first_name}}&
    tier={{webhook.response.tier}}&
    passes={{webhook.response.guest_passes_remaining}}&
    family_in_pool={{webhook.response.family_in_pool}}

Already checked in (409 from /webhooks/ghl/checkin):
  https://api.yourdomain.com/welcome?status=already_checked_in&name={{contact.first_name}}

Not found (404):
  https://api.yourdomain.com/welcome?status=not_found&name={{contact.first_name}}

At capacity (403):
  https://api.yourdomain.com/welcome?status=at_capacity

═══════════════════════════════════════════════════════════════
TEST PLAN
═══════════════════════════════════════════════════════════════

Manual browser tests (open each URL in mobile Safari/Chrome):

Welcome:
  /welcome?status=success&name=Lisa&tier=Family%20Membership&passes=3&family_in_pool=2
  /welcome?status=already_checked_in&name=Lisa
  /welcome?status=not_found&name=Maria
  /welcome?status=at_capacity

Goodbye:
  /goodbye?status=success&name=Lisa&duration=127
  /goodbye?status=success&name=Lisa (no duration)
  /goodbye?status=not_checked_in&name=Anon

Signed-up:
  /signed-up?status=success&name=Melissa&tier=Family&family_members=Jason,Tyler,Chase&passes=5
  /signed-up?status=success&name=Solo&tier=Adult
  /signed-up?status=error&email=help@wedgewoodpool.com

Verify on each:
  - Loads in <1 second
  - Logo renders at top
  - Card is centered, readable in sunlight (high contrast)
  - Icon animates in (unless prefers-reduced-motion)
  - Buttons are 48px+ tall (touch-friendly)
  - Footer shows pool address
  - HTML-escapes properly (try ?name=%3Cscript%3E)

═══════════════════════════════════════════════════════════════
COMMIT
═══════════════════════════════════════════════════════════════

git add src/handlers/memberPages.ts src/templates/ src/server.ts
git commit -m "feat: branded member-facing confirmation pages (/welcome, /goodbye, /signed-up)"
git push

═══════════════════════════════════════════════════════════════
PROCEED
═══════════════════════════════════════════════════════════════

Build all three handlers + the template + the shared styles. Test 
each URL variant in browser DevTools mobile view (iPhone SE / iPad Mini). 
Push when done.
```

---

After both prompts have been executed, the system will have:

- **Staff dashboard** (React) at `pooladmin.govenderly.us` — used by lifeguards on iPad
- **Member pages** (HTML) at `pooladmin.govenderly.us/welcome|/goodbye|/signed-up` — used by members on their phone after submitting GHL forms
- **Same Express server** serves both — single deployment, no CORS, no auth headaches

This is the full v2 frontend layer.
