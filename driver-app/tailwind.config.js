/**
 * Design tokens live HERE — this file is the single source of truth for
 * colors, spacing and typography used via className.
 *
 * If you need a token imperatively (rare), import it from
 * `src/shared/theme/colors.ts`, which mirrors this palette.
 * The "design-tokens" doc explains the sync rule:
 * docs/conventions/design-system.md
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Linky brand — emerald green (« vert émeraude », confiance). The driver app
        // shares the Linky marketplace identity; this REBRANDS the skeleton's
        // placeholder indigo per docs/conventions/design-system.md. Ramp anchored on
        // the canonical primary #0E6E55 / primary-deep #0A5240 / primary-soft #E8F2EE.
        brand: {
          50: '#E8F2EE',
          100: '#CFE5DD',
          500: '#0E6E55',
          600: '#0A5240',
          700: '#083B2D',
        },
        // Saffron accent (« safran », valeur) — the second Linky pillar, for value/
        // highlight emphasis (use sparingly; never as a primary action color).
        accent: {
          DEFAULT: '#E8A53D',
          soft: '#FCF1DC',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8FAFC',
          inverse: '#0F172A',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
          faint: '#94A3B8',
          inverse: '#F8FAFC',
        },
        danger: '#D14F3C',
        success: '#1FA971',
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
      },
      borderRadius: {
        card: '16px',
        control: '12px',
      },
    },
  },
  plugins: [],
};
