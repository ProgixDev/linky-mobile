/**
 * Programmatic mirror of the Tailwind palette for the rare cases where a
 * color is needed outside className (e.g. native navigation options,
 * ActivityIndicator tint).
 *
 * SOURCE OF TRUTH: tailwind.config.js — keep both in sync.
 * docs/conventions/design-system.md documents the sync rule.
 */
export const colors = {
  // Linky brand — emerald green (rebranded from the skeleton's placeholder indigo;
  // see tailwind.config.js + docs/conventions/design-system.md).
  brand500: '#0E6E55',
  brand600: '#0A5240',
  brand700: '#083B2D',
  // Saffron accent — the second Linky pillar (value/highlight).
  accent: '#E8A53D',
  accentSoft: '#FCF1DC',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceInverse: '#0F172A',
  ink: '#0F172A',
  inkMuted: '#64748B',
  inkFaint: '#94A3B8',
  inkInverse: '#F8FAFC',
  danger: '#D14F3C',
  success: '#1FA971',
} as const;
