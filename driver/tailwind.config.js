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
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
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
        danger: '#DC2626',
        success: '#16A34A',
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
