# Wedgewood Swim Club v2 — Design Tokens

Source of truth for all colors, spacing, typography, and shadows. These values are mirrored in the Figma file (`729vdONzTwZnzvxkai3xoQ`) and must match exactly in the React app's Tailwind config and CSS variables.

---

## Color Primitives (Raw Palette)

Never reference primitives directly in components. They exist to be aliased by semantic tokens.

### Teal — Pool Blue (Primary Accent)
| Token | Hex | Use |
|---|---|---|
| `teal/50` | `#E3F2FD` | Lightest tint, hover backgrounds |
| `teal/100` | `#BBDEFB` | |
| `teal/200` | `#90CAF9` | |
| `teal/300` | `#64B5F6` | Dark mode accent |
| `teal/400` | `#42A5F5` | Dark mode primary action |
| `teal/500` | `#2196F3` | **Primary accent** (light mode) |
| `teal/600` | `#1E88E5` | Hover state on primary |
| `teal/700` | `#1976D2` | Active state, accent text on light bg |
| `teal/800` | `#1565C0` | |
| `teal/900` | `#0D47A1` | Deepest, rarely used |

### Navy — Deep Brand Color
| Token | Hex | Use |
|---|---|---|
| `navy/50` | `#E8EAF0` | |
| `navy/100` | `#C5CAD9` | |
| `navy/200` | `#9DA7BD` | |
| `navy/300` | `#7584A1` | |
| `navy/400` | `#58698D` | |
| `navy/500` | `#3B4F79` | |
| `navy/600` | `#354871` | Dark mode border strong |
| `navy/700` | `#1B3A5C` | **Wedgewood deep navy** — headings, dark surface raised |
| `navy/800` | `#15294A` | Dark mode surface |
| `navy/900` | `#0F1B2D` | Dark mode canvas, primary text on light |

### Gray — Neutrals
| Token | Hex |
|---|---|
| `gray/50` | `#FAFAFA` |
| `gray/100` | `#F5F5F5` |
| `gray/200` | `#EEEEEE` |
| `gray/300` | `#E0E0E0` |
| `gray/400` | `#BDBDBD` |
| `gray/500` | `#9E9E9E` |
| `gray/600` | `#757575` |
| `gray/700` | `#616161` |
| `gray/800` | `#424242` |
| `gray/900` | `#212121` |

### Semantic Ramps
| Token | Hex | Use |
|---|---|---|
| `red/50` | `#FEE2E2` | Danger background (light) |
| `red/500` | `#D32F2F` | Danger icon |
| `red/700` | `#B71C1C` | Danger text (light) |
| `green/50` | `#E8F5E9` | Success background (light) |
| `green/500` | `#2E7D32` | Success icon |
| `green/700` | `#1B5E20` | Success text (light) |
| `yellow/50` | `#FFF8E1` | Warning background (light) |
| `yellow/500` | `#F9A825` | Warning icon |
| `yellow/700` | `#F57F17` | Warning text (light) |
| `aqua/50` | `#F0F7FA` | **Wedgewood signature canvas tint** |
| `white` | `#FFFFFF` | |
| `black` | `#000000` | |

---

## Semantic Color Tokens (What Components Use)

These are the only color names that components should reference. Each maps to different primitives in Light vs Dark mode.

### Backgrounds
| Token | Light Mode | Dark Mode |
|---|---|---|
| `bg/canvas` | `aqua/50` `#F0F7FA` | `navy/900` `#0F1B2D` |
| `bg/surface` | `white` `#FFFFFF` | `navy/800` `#15294A` |
| `bg/surface-raised` | `white` `#FFFFFF` | `navy/700` `#1B3A5C` |
| `bg/muted` | `gray/100` `#F5F5F5` | `navy/800` `#15294A` |
| `bg/hover` | `gray/50` `#FAFAFA` | `navy/700` `#1B3A5C` |

### Text
| Token | Light Mode | Dark Mode |
|---|---|---|
| `text/primary` | `navy/900` `#0F1B2D` | `white` `#FFFFFF` |
| `text/secondary` | `gray/700` `#616161` | `gray/300` `#E0E0E0` |
| `text/tertiary` | `gray/500` `#9E9E9E` | `gray/400` `#BDBDBD` |
| `text/inverse` | `white` | `navy/900` |
| `text/accent` | `teal/700` `#1976D2` | `teal/300` `#64B5F6` |

### Border
| Token | Light Mode | Dark Mode |
|---|---|---|
| `border/default` | `gray/200` `#EEEEEE` | `navy/700` `#1B3A5C` |
| `border/strong` | `gray/300` `#E0E0E0` | `navy/600` `#354871` |
| `border/focus` | `teal/500` `#2196F3` | `teal/400` `#42A5F5` |
| `border/accent` | `teal/500` `#2196F3` | `teal/400` `#42A5F5` |

### Accent (Primary Action)
| Token | Light Mode | Dark Mode |
|---|---|---|
| `accent/primary` | `teal/500` `#2196F3` | `teal/400` `#42A5F5` |
| `accent/primary-hover` | `teal/600` `#1E88E5` | `teal/300` `#64B5F6` |
| `accent/primary-text` | `white` | `white` |

### Status
| Token | Light Mode | Dark Mode |
|---|---|---|
| `success/bg` | `green/50` | `green/700` |
| `success/text` | `green/700` | `green/500` |
| `success/icon` | `green/500` | `green/500` |
| `warning/bg` | `yellow/50` | `yellow/700` |
| `warning/text` | `yellow/700` | `yellow/500` |
| `warning/icon` | `yellow/500` | `yellow/500` |
| `danger/bg` | `red/50` | `red/700` |
| `danger/text` | `red/700` | `red/500` |
| `danger/icon` | `red/500` | `red/500` |

---

## Spacing Scale

CSS values in `px`. Tailwind utility classes generated as `space-xs`, `gap-md`, `p-lg`, etc.

| Token | Value |
|---|---|
| `xs` | 4px |
| `sm` | 8px |
| `md` | 16px |
| `lg` | 24px |
| `xl` | 32px |
| `2xl` | 48px |
| `3xl` | 64px |

---

## Border Radius Scale

| Token | Value |
|---|---|
| `sm` | 4px |
| `md` | 8px |
| `lg` | 12px |
| `xl` | 16px |
| `2xl` | 20px |
| `full` | 9999px (pill) |

---

## Typography

All Inter font. Sizes in `px`, line-heights in `px`.

| Style | Size | Line Height | Weight | Use |
|---|---|---|---|---|
| `Display` | 32 | 40 | 700 Bold | Page hero, big stats |
| `H1` | 28 | 36 | 700 Bold | Section headers |
| `H2` | 24 | 32 | 600 Semi Bold | Card headers |
| `H3` | 20 | 28 | 600 Semi Bold | Subsection headers |
| `Body` | 16 | 24 | 400 Regular | Default body text |
| `Body Medium` | 16 | 24 | 500 Medium | Emphasized body |
| `Body Small` | 14 | 20 | 400 Regular | Secondary body |
| `Body Small Medium` | 14 | 20 | 500 Medium | Labels |
| `Caption` | 12 | 16 | 400 Regular | Hints, metadata |
| `Caption Medium` | 12 | 16 | 500 Medium | Badges, small labels |
| `Number XL` | 56 | 56 | 700 Bold + tabular-nums | Swimmer count hero |
| `Number L` | 32 | 36 | 600 Semi Bold + tabular-nums | Stat card numbers |

**Font import (in `index.html`):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Or use the variable font (`Inter Variable`) for smaller payload.

---

## Shadows (Elevation)

Drop shadows with navy/700-tinted color for cohesion.

| Token | CSS |
|---|---|
| `shadow/sm` | `0 1px 2px rgba(27, 58, 92, 0.06)` |
| `shadow/md` | `0 4px 12px rgba(27, 58, 92, 0.08)` |
| `shadow/lg` | `0 8px 24px -4px rgba(27, 58, 92, 0.12)` |
| `shadow/xl` | `0 16px 40px -8px rgba(27, 58, 92, 0.16)` |

---

## CSS Variable Definitions (for `globals.css`)

Paste this into `src/styles/globals.css` (or equivalent):

```css
:root {
  /* === Color primitives === */
  --teal-50: #E3F2FD; --teal-100: #BBDEFB; --teal-200: #90CAF9;
  --teal-300: #64B5F6; --teal-400: #42A5F5; --teal-500: #2196F3;
  --teal-600: #1E88E5; --teal-700: #1976D2; --teal-800: #1565C0;
  --teal-900: #0D47A1;

  --navy-50: #E8EAF0; --navy-100: #C5CAD9; --navy-200: #9DA7BD;
  --navy-300: #7584A1; --navy-400: #58698D; --navy-500: #3B4F79;
  --navy-600: #354871; --navy-700: #1B3A5C; --navy-800: #15294A;
  --navy-900: #0F1B2D;

  --gray-50: #FAFAFA; --gray-100: #F5F5F5; --gray-200: #EEEEEE;
  --gray-300: #E0E0E0; --gray-400: #BDBDBD; --gray-500: #9E9E9E;
  --gray-600: #757575; --gray-700: #616161; --gray-800: #424242;
  --gray-900: #212121;

  --red-50: #FEE2E2; --red-500: #D32F2F; --red-700: #B71C1C;
  --green-50: #E8F5E9; --green-500: #2E7D32; --green-700: #1B5E20;
  --yellow-50: #FFF8E1; --yellow-500: #F9A825; --yellow-700: #F57F17;

  --aqua-50: #F0F7FA;
  --white: #FFFFFF;
  --black: #000000;

  /* === Spacing === */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --spacing-3xl: 64px;

  /* === Radii === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px rgba(27, 58, 92, 0.06);
  --shadow-md: 0 4px 12px rgba(27, 58, 92, 0.08);
  --shadow-lg: 0 8px 24px -4px rgba(27, 58, 92, 0.12);
  --shadow-xl: 0 16px 40px -8px rgba(27, 58, 92, 0.16);
}

/* === Light theme (default) === */
:root,
[data-theme="light"] {
  --bg-canvas: var(--aqua-50);
  --bg-surface: var(--white);
  --bg-surface-raised: var(--white);
  --bg-muted: var(--gray-100);
  --bg-hover: var(--gray-50);

  --text-primary: var(--navy-900);
  --text-secondary: var(--gray-700);
  --text-tertiary: var(--gray-500);
  --text-inverse: var(--white);
  --text-accent: var(--teal-700);

  --border-default: var(--gray-200);
  --border-strong: var(--gray-300);
  --border-focus: var(--teal-500);
  --border-accent: var(--teal-500);

  --accent-primary: var(--teal-500);
  --accent-primary-hover: var(--teal-600);
  --accent-primary-text: var(--white);

  --success-bg: var(--green-50);
  --success-text: var(--green-700);
  --success-icon: var(--green-500);
  --warning-bg: var(--yellow-50);
  --warning-text: var(--yellow-700);
  --warning-icon: var(--yellow-500);
  --danger-bg: var(--red-50);
  --danger-text: var(--red-700);
  --danger-icon: var(--red-500);
}

/* === Dark theme === */
[data-theme="dark"] {
  --bg-canvas: var(--navy-900);
  --bg-surface: var(--navy-800);
  --bg-surface-raised: var(--navy-700);
  --bg-muted: var(--navy-800);
  --bg-hover: var(--navy-700);

  --text-primary: var(--white);
  --text-secondary: var(--gray-300);
  --text-tertiary: var(--gray-400);
  --text-inverse: var(--navy-900);
  --text-accent: var(--teal-300);

  --border-default: var(--navy-700);
  --border-strong: var(--navy-600);
  --border-focus: var(--teal-400);
  --border-accent: var(--teal-400);

  --accent-primary: var(--teal-400);
  --accent-primary-hover: var(--teal-300);
  --accent-primary-text: var(--white);

  --success-bg: var(--green-700);
  --success-text: var(--green-500);
  --success-icon: var(--green-500);
  --warning-bg: var(--yellow-700);
  --warning-text: var(--yellow-500);
  --warning-icon: var(--yellow-500);
  --danger-bg: var(--red-700);
  --danger-text: var(--red-500);
  --danger-icon: var(--red-500);
}

/* === Respect user OS preference === */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Re-apply dark theme — duplicate from [data-theme="dark"] block above */
  }
}

/* === Base body styles === */
body {
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  font-feature-settings: 'cv11', 'ss01';
  transition: background-color 200ms ease, color 200ms ease;
}
```

---

## Tailwind Config (`tailwind.config.ts`)

Extend the default Tailwind theme to use our CSS variables. This gives you classes like `bg-canvas`, `text-primary`, `border-default`, etc.

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Semantic colors — these are what components use
        canvas: 'var(--bg-canvas)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          raised: 'var(--bg-surface-raised)',
        },
        muted: 'var(--bg-muted)',
        hover: 'var(--bg-hover)',

        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-inverse)',
          accent: 'var(--text-accent)',
        },

        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          focus: 'var(--border-focus)',
          accent: 'var(--border-accent)',
        },

        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-primary-hover)',
          text: 'var(--accent-primary-text)',
        },

        success: {
          bg: 'var(--success-bg)',
          text: 'var(--success-text)',
          icon: 'var(--success-icon)',
        },
        warning: {
          bg: 'var(--warning-bg)',
          text: 'var(--warning-text)',
          icon: 'var(--warning-icon)',
        },
        danger: {
          bg: 'var(--danger-bg)',
          text: 'var(--danger-text)',
          icon: 'var(--danger-icon)',
        },

        // Raw primitives (rarely used directly, mostly for shadcn theme)
        teal: {
          50: 'var(--teal-50)', 100: 'var(--teal-100)',
          200: 'var(--teal-200)', 300: 'var(--teal-300)',
          400: 'var(--teal-400)', 500: 'var(--teal-500)',
          600: 'var(--teal-600)', 700: 'var(--teal-700)',
          800: 'var(--teal-800)', 900: 'var(--teal-900)',
        },
        navy: {
          50: 'var(--navy-50)', 100: 'var(--navy-100)',
          200: 'var(--navy-200)', 300: 'var(--navy-300)',
          400: 'var(--navy-400)', 500: 'var(--navy-500)',
          600: 'var(--navy-600)', 700: 'var(--navy-700)',
          800: 'var(--navy-800)', 900: 'var(--navy-900)',
        },
      },
      spacing: {
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'caption': ['12px', { lineHeight: '16px' }],
        'body-sm': ['14px', { lineHeight: '20px' }],
        'body': ['16px', { lineHeight: '24px' }],
        'h3': ['20px', { lineHeight: '28px' }],
        'h2': ['24px', { lineHeight: '32px' }],
        'h1': ['28px', { lineHeight: '36px' }],
        'display': ['32px', { lineHeight: '40px' }],
        'number-l': ['32px', { lineHeight: '36px' }],
        'number-xl': ['56px', { lineHeight: '56px' }],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## Theme Switching (React Hook)

```typescript
// src/hooks/useTheme.ts
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // No localStorage per app constraints — read OS preference instead
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme = theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    root.setAttribute('data-theme', resolvedTheme);
  }, [theme]);

  return { theme, setTheme };
}
```

---

## Token Naming Reference (Figma ↔ CSS)

If you ever need to reference a Figma variable name and find its CSS equivalent, the rule is: replace `/` with `-` and lowercase. Examples:

| Figma name | CSS variable |
|---|---|
| `color/bg/canvas` | `--bg-canvas` |
| `text/primary` | `--text-primary` |
| `accent/primary-hover` | `--accent-primary-hover` |
| `spacing/md` | `--spacing-md` |
| `radius/lg` | `--radius-lg` |
| `shadow/sm` | `--shadow-sm` |

---

**Source Figma file:** https://www.figma.com/design/729vdONzTwZnzvxkai3xoQ

All values above are the canonical source of truth. If you change a value, update both the Figma file AND this document AND `globals.css`.
