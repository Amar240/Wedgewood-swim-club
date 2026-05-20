import { getMember } from '../services/members.mjs';

const LOCATION_ID = 'Bjt6c984XN3YKY5porzI';
const LOGO_URL = 'https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png';
const HOME_URL = 'https://wedgewoodpool.com';
const CONTACT_EMAIL = 'info@wedgewoodpool.com';

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

function getFirstName(member, queryFirstName) {
  const requestedName = cleanString(queryFirstName);
  if (requestedName) return requestedName;

  const memberFirstName = cleanString(member?.first_name);
  if (memberFirstName) return memberFirstName;

  const membershipName = cleanString(member?.membershipName ?? member?.full_name);
  return membershipName.split(/\s+/)[0] || 'there';
}

function getStateConfig(state, firstName) {
  const safeFirstName = esc(firstName);

  const configs = {
    success: {
      tone: 'success',
      emoji: '👋',
      headline: `See you soon, ${safeFirstName}!`,
      subline: 'Thanks for visiting Wedgewood today.',
      note: 'Stay safe and enjoy the rest of your day.',
    },
    not_found: {
      tone: 'neutral',
      emoji: '❓',
      headline: 'Have a good day!',
      subline: "We don't have a record of your check-in, but thanks for visiting!",
      note: `If you think this is a mistake, please reach out at <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.`,
    },
    no_email: {
      tone: 'neutral',
      emoji: '👋',
      headline: 'Thanks for visiting!',
      subline: 'Have a great rest of your day.',
    },
  };

  return configs[state] ?? configs.no_email;
}

function renderGoodbyePage(config) {
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

      .card.success .icon-wrap {
        background: rgba(33, 150, 243, 0.1);
      }

      .card.neutral .icon-wrap {
        background: var(--aqua-tint);
      }

      .icon-emoji {
        font-size: 52px;
        line-height: 1;
        user-select: none;
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

      .note {
        margin: 10px 0 0;
        color: var(--text-mid);
        font-size: 14px;
        font-weight: 400;
        line-height: 1.5;
      }

      .note a {
        color: var(--pool-teal);
        text-decoration: none;
      }

      .note a:hover {
        text-decoration: underline;
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
        cursor: pointer;
      }

      .button:hover {
        background: #177FD0;
      }

      .button:active {
        transform: scale(0.98);
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
          transform: scale(1.15);
        }

        100% {
          transform: scale(1);
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
        <div class="icon-wrap" aria-hidden="true">
          <span class="icon-emoji">${config.emoji}</span>
        </div>
        <h1>${config.headline}</h1>
        <p>${config.subline}</p>
        ${config.note ? `<p class="note">${config.note}</p>` : ''}
        <div class="actions">
          <button class="button" type="button" data-done>Done</button>
        </div>
      </section>

      <footer class="footer">Wedgewood Swim Club · Have a great day! 🏊</footer>
    </main>

    <script>
      document.querySelector('[data-done]')?.addEventListener('click', () => {
        window.close();
        window.setTimeout(() => {
          if (!window.closed) {
            window.location.assign('${HOME_URL}');
          }
        }, 150);
      });
    </script>
  </body>
</html>`;
}

export async function goodbyeHandler(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');

    const email = cleanString(req.query?.email).toLowerCase();
    const queryFirstName = cleanString(req.query?.first_name);

    if (!email) {
      return res.status(200).type('html').send(
        renderGoodbyePage(getStateConfig('no_email', queryFirstName || 'there')),
      );
    }

    const member = await getMember(LOCATION_ID, email);
    const firstName = getFirstName(member, queryFirstName);
    const state = member ? 'success' : 'not_found';

    return res.status(200).type('html').send(
      renderGoodbyePage(getStateConfig(state, firstName)),
    );
  } catch (error) {
    return next(error);
  }
}
