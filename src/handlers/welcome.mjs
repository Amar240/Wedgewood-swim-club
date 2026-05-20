import { getMember } from '../services/members.mjs';
import { isAlreadyCheckedIn } from '../utils/stateCheck.mjs';

const LOCATION_ID = 'Bjt6c984XN3YKY5porzI';
const LOGO_URL = 'https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png';
const HOME_URL = 'https://wedgewoodpool.com';
const MEMBERSHIPS_URL = 'https://wedgewoodpool.com/memberships';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getMembershipStatus(member) {
  return String(member?.membership_status ?? member?.membershipStatus ?? '').toLowerCase();
}

function getFirstName(member, queryFirstName) {
  const requestedName = cleanString(queryFirstName);

  if (requestedName) {
    return requestedName;
  }

  const memberFirstName = cleanString(member?.first_name);

  if (memberFirstName) {
    return memberFirstName;
  }

  const membershipName = cleanString(member?.membershipName ?? member?.full_name);
  return membershipName.split(/\s+/)[0] || 'there';
}

function getMembershipName(member, firstName) {
  return cleanString(member?.membershipName ?? member?.full_name) || firstName || 'member';
}

async function getResultState(member) {
  if (!member) {
    return 'not_found';
  }

  if (getMembershipStatus(member) !== 'active') {
    return 'expired';
  }

  if (member.phone) {
    const alreadyCheckedIn = await isAlreadyCheckedIn(
      LOCATION_ID,
      getMembershipName(member, member.first_name),
      member.phone,
    );

    if (alreadyCheckedIn) {
      return 'already_signed_in';
    }
  }

  return 'valid';
}

function getStateConfig(state, firstName) {
  const safeFirstName = esc(firstName);

  const configs = {
    valid: {
      tone: 'valid',
      icon: 'check',
      headline: `Welcome, ${safeFirstName}!`,
      subline: "You're checked in. Enjoy the pool!",
      primaryLabel: 'Done',
      showCountdown: true,
    },
    already_signed_in: {
      tone: 'warning',
      icon: 'exclamation',
      headline: 'Already signed in earlier today',
      subline: "Please visit the front desk if this doesn't look right.",
      primaryLabel: 'Done',
      pulse: true,
    },
    expired: {
      tone: 'warning',
      icon: 'clock',
      headline: 'Your membership has expired',
      subline: 'Please visit the front desk to renew.',
      primaryLabel: 'Done',
    },
    not_found: {
      tone: 'error',
      icon: 'x',
      headline: "Hmm, we couldn't find your membership",
      subline: 'Please check in with the front desk, or sign up at wedgewoodpool.com/memberships.',
      primaryLabel: 'Done',
      signup: true,
    },
    no_email: {
      tone: 'neutral',
      icon: 'info',
      headline: 'Form received',
      subline: 'Please head to the front desk for assistance.',
      primaryLabel: 'Done',
    },
  };

  return configs[state] ?? configs.no_email;
}

function renderIcon(icon) {
  if (icon === 'check') {
    return `
      <svg viewBox="0 0 96 96" role="img" aria-label="Success">
        <circle class="icon-circle" cx="48" cy="48" r="39"></circle>
        <path class="check-path" d="M30 49.5 42.5 62 67.5 35"></path>
      </svg>
    `;
  }

  if (icon === 'exclamation') {
    return `
      <svg viewBox="0 0 96 96" role="img" aria-label="Already signed in">
        <circle class="icon-circle" cx="48" cy="48" r="39"></circle>
        <path class="icon-stroke" d="M48 25v31"></path>
        <circle class="icon-dot" cx="48" cy="68" r="4"></circle>
      </svg>
    `;
  }

  if (icon === 'clock') {
    return `
      <svg viewBox="0 0 96 96" role="img" aria-label="Expired">
        <circle class="icon-circle" cx="48" cy="48" r="39"></circle>
        <path class="icon-stroke" d="M48 27v23l16 10"></path>
      </svg>
    `;
  }

  if (icon === 'x') {
    return `
      <svg viewBox="0 0 96 96" role="img" aria-label="Not found">
        <circle class="icon-circle" cx="48" cy="48" r="39"></circle>
        <path class="icon-stroke" d="M34 34l28 28M62 34 34 62"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 96 96" role="img" aria-label="Information">
      <circle class="icon-circle" cx="48" cy="48" r="39"></circle>
      <path class="icon-stroke" d="M48 44v27"></path>
      <circle class="icon-dot" cx="48" cy="29" r="4"></circle>
    </svg>
  `;
}

function renderWelcomePage(config) {
  const autoRedirectScript = config.showCountdown
    ? `
      let seconds = 5;
      const countdown = document.querySelector('[data-countdown]');
      const tick = () => {
        seconds -= 1;
        if (countdown) {
          countdown.textContent = String(Math.max(seconds, 0));
        }
        if (seconds <= 0) {
          window.location.assign('${HOME_URL}');
        }
      };
      window.setTimeout(() => window.setInterval(tick, 1000), 250);
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wedgewood Swim Club</title>
    <style>
      :root {
        --pool-teal: #2196F3;
        --deep-navy: #1B3A5C;
        --aqua-tint: #E8F4F8;
        --soft-yellow: #FFF8E1;
        --warning-yellow: #F9A825;
        --soft-red: #FEE2E2;
        --error-red: #D32F2F;
        --success-green: #2E7D32;
        --white: #FFFFFF;
        --text-dark: #1A1A1A;
        --text-mid: #4A5568;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        min-height: 100%;
        margin: 0;
      }

      body {
        display: grid;
        min-height: 100dvh;
        place-items: center;
        padding: 24px;
        color: var(--text-dark);
        background: linear-gradient(180deg, #E8F4F8 0%, #FFFFFF 100%);
        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: 0;
        animation: pageFade 300ms ease-out forwards;
      }

      main {
        width: min(100%, 430px);
        text-align: center;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
        color: var(--deep-navy);
        font-size: 18px;
        font-weight: 700;
      }

      .brand-logo {
        display: grid;
        width: 58px;
        height: 58px;
        place-items: center;
        background: var(--white);
        border-radius: 14px;
        box-shadow: 0 4px 12px rgba(27, 58, 92, 0.08);
      }

      .brand-logo img {
        width: 48px;
        height: 48px;
        object-fit: contain;
      }

      .card {
        padding: 24px;
        background: var(--white);
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(27, 58, 92, 0.08);
        transform: scale(0.96);
        animation: cardIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms forwards;
      }

      .icon-wrap {
        display: grid;
        width: 96px;
        height: 96px;
        margin: 4px auto 22px;
        place-items: center;
        border-radius: 50%;
        transform: scale(0);
        animation: iconPop 500ms ease-out 220ms forwards;
      }

      .card.valid .icon-wrap {
        background: rgba(46, 125, 50, 0.1);
      }

      .card.warning .icon-wrap {
        background: var(--soft-yellow);
      }

      .card.error .icon-wrap {
        background: var(--soft-red);
      }

      .card.neutral .icon-wrap {
        background: var(--aqua-tint);
      }

      .card.valid .icon-wrap,
      .card.warning .icon-wrap.pulse {
        animation: iconPop 500ms ease-out 220ms forwards, iconPulse 3s ease-in-out 900ms infinite;
      }

      svg {
        width: 76px;
        height: 76px;
        overflow: visible;
      }

      .icon-circle,
      .icon-stroke,
      .check-path {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 7;
      }

      .icon-dot {
        stroke: none;
      }

      .valid .icon-circle,
      .valid .check-path {
        stroke: var(--success-green);
      }

      .warning .icon-circle,
      .warning .icon-stroke {
        stroke: var(--warning-yellow);
      }

      .warning .icon-dot {
        fill: var(--warning-yellow);
      }

      .error .icon-circle,
      .error .icon-stroke {
        stroke: var(--error-red);
      }

      .neutral .icon-circle,
      .neutral .icon-stroke {
        stroke: var(--text-mid);
      }

      .neutral .icon-dot {
        fill: var(--text-mid);
      }

      .check-path {
        stroke-dasharray: 80;
        stroke-dashoffset: 80;
        animation: drawCheck 600ms ease-out 650ms forwards;
      }

      h1 {
        margin: 0;
        color: var(--deep-navy);
        font-size: clamp(28px, 7vw, 32px);
        font-weight: 700;
        line-height: 1.12;
      }

      p {
        margin: 14px 0 0;
        color: var(--text-mid);
        font-size: 17px;
        font-weight: 400;
        line-height: 1.45;
      }

      .actions {
        display: grid;
        gap: 12px;
        justify-items: center;
        margin-top: 24px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 50px;
        padding: 14px 28px;
        color: var(--white);
        background: var(--pool-teal);
        border: 0;
        border-radius: 12px;
        font-size: 18px;
        font-weight: 600;
        line-height: 1;
        text-decoration: none;
        transition: background 140ms ease, transform 120ms ease;
      }

      .button:hover {
        background: #177FD0;
      }

      .button:active {
        transform: scale(0.98);
      }

      .secondary-link {
        min-height: 44px;
        color: var(--pool-teal);
        background: transparent;
        border: 0;
        font-size: 16px;
        font-weight: 600;
        text-decoration: none;
      }

      .secondary-link:hover,
      .secondary-link:active {
        text-decoration: underline;
      }

      .countdown {
        margin-top: 18px;
        color: var(--text-mid);
        font-size: 14px;
        font-weight: 400;
      }

      .countdown span {
        display: inline-block;
        min-width: 1ch;
        color: var(--deep-navy);
        font-weight: 700;
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .footer {
        margin-top: 32px;
        color: var(--text-mid);
        font-size: 14px;
        font-weight: 400;
      }

      @keyframes pageFade {
        to {
          opacity: 1;
        }
      }

      @keyframes cardIn {
        to {
          transform: scale(1);
        }
      }

      @keyframes iconPop {
        0% {
          transform: scale(0);
        }

        72% {
          transform: scale(1.1);
        }

        100% {
          transform: scale(1);
        }
      }

      @keyframes drawCheck {
        to {
          stroke-dashoffset: 0;
        }
      }

      @keyframes iconPulse {
        0%,
        100% {
          transform: scale(1);
        }

        50% {
          transform: scale(1.04);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.001ms !important;
        }

        body {
          opacity: 1;
        }

        .card,
        .icon-wrap {
          transform: scale(1);
        }

        .check-path {
          stroke-dashoffset: 0;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="brand" aria-label="Wedgewood Swim Club">
        <span class="brand-logo">
          <img src="${LOGO_URL}" alt="Wedgewood Swim Club logo">
        </span>
        <span>Wedgewood Swim Club</span>
      </header>

      <section class="card ${esc(config.tone)}" aria-live="polite">
        <div class="icon-wrap${config.pulse ? ' pulse' : ''}" aria-hidden="true">
          ${renderIcon(config.icon)}
        </div>
        <h1>${config.headline}</h1>
        <p>${config.subline}</p>
        ${config.showCountdown ? '<div class="countdown">Redirecting in <span data-countdown>5</span>...</div>' : ''}
        <div class="actions">
          ${config.signup ? `<a class="button" href="${MEMBERSHIPS_URL}">Sign up for membership</a>` : ''}
          <button class="button" type="button" data-done>${config.primaryLabel}</button>
          <a class="secondary-link" href="${HOME_URL}">Back to wedgewoodpool.com</a>
        </div>
      </section>

      <footer class="footer">Wedgewood Swim Club · Have a great swim! 🏊</footer>
    </main>

    <script>
      const closeOrRedirect = () => {
        window.close();
        window.setTimeout(() => {
          if (!window.closed) {
            window.location.assign('${HOME_URL}');
          }
        }, 150);
      };

      document.querySelector('[data-done]')?.addEventListener('click', closeOrRedirect);
      ${autoRedirectScript}
    </script>
  </body>
</html>`;
}

export async function welcomeHandler(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');

    const email = cleanString(req.query?.email).toLowerCase();
    const queryFirstName = cleanString(req.query?.first_name);

    if (!email) {
      return res.status(200).type('html').send(
        renderWelcomePage(getStateConfig('no_email', queryFirstName)),
      );
    }

    const member = await getMember(LOCATION_ID, email);
    const firstName = getFirstName(member, queryFirstName);
    const state = await getResultState(member);

    return res.status(200).type('html').send(
      renderWelcomePage(getStateConfig(state, firstName)),
    );
  } catch (error) {
    return next(error);
  }
}
