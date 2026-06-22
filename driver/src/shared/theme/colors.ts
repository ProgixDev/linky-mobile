/**
 * Programmatic mirror of the Tailwind palette for the rare cases where a
 * color is needed outside className (e.g. native navigation options,
 * ActivityIndicator tint).
 *
 * SOURCE OF TRUTH: tailwind.config.js — keep both in sync.
 * docs/conventions/design-system.md documents the sync rule.
 */
export const colors = {
  brand500: '#6366F1',
  brand600: '#4F46E5',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceInverse: '#0F172A',
  ink: '#0F172A',
  inkMuted: '#64748B',
  inkFaint: '#94A3B8',
  inkInverse: '#F8FAFC',
  danger: '#DC2626',
  success: '#16A34A',
} as const;
