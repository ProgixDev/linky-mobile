// Design tokens ported from /design/styles.css.
// Source of truth — components consume these via useTheme().

export type ThemeName = 'light' | 'dark';

export const brand = {
  primary: '#0E6E55',
  primaryDeep: '#0A5240',
  accent: '#E8A53D',
  accentText: '#8B5A0A', // dark gold for text on accent-soft
  success: '#1FA971',
  danger: '#D14F3C',
  info: '#3A7CA8',
  // Découvrir is ALWAYS dark, regardless of theme
  discoverBg: '#0E1311',
} as const;

export interface Colors {
  primary: string;
  primaryDeep: string;
  accent: string;
  accentText: string;
  success: string;
  danger: string;
  info: string;
  discoverBg: string;
  bg: string;
  bgElev: string;
  bgSunken: string;
  card: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  primarySoft: string;
  accentSoft: string;
}

export const lightColors: Colors = {
  ...brand,
  bg: '#F7F3EC',
  bgElev: '#FFFFFF',
  bgSunken: '#EFE8DA',
  card: '#FFFFFF',
  text: '#0E1311',
  textMuted: '#5E6864',
  textFaint: '#8C9590',
  border: '#E5DED1',
  borderStrong: '#D4CCBA',
  primarySoft: '#E8F2EE',
  accentSoft: '#FCF1DC',
};

export const darkColors: Colors = {
  ...brand,
  // Fully-black dark mode (client request 2026-07-22): true-black base surfaces,
  // cards/sheets lifted just enough for depth. No washed-out green tint.
  bg: '#000000',
  bgElev: '#121212',
  bgSunken: '#000000',
  card: '#121212',
  text: '#F7F3EC',
  textMuted: '#94A39C',
  textFaint: '#6A746F',
  border: '#242424',
  borderStrong: '#333333',
  primarySoft: '#14271F',
  accentSoft: '#2A2114',
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
} as const;

// Typography. Font weights drive system font selection (San Francisco on iOS,
// Roboto on Android). When Cabinet Grotesk / Inter are bundled in assets/fonts,
// add `fontFamily` entries here and reload — every Text variant will pick them up.
export const typography = {
  dispXl: { fontSize: 32, lineHeight: 36, letterSpacing: -0.64, fontWeight: '700' as const },
  dispL: { fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontWeight: '700' as const },
  titleL: { fontSize: 20, lineHeight: 26, letterSpacing: -0.2, fontWeight: '700' as const },
  titleM: { fontSize: 17, lineHeight: 22, letterSpacing: -0.085, fontWeight: '600' as const },
  bodyL: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyM: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodyMSemibold: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.2, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 0.5, fontWeight: '600' as const },
  tabnum: { fontVariant: ['tabular-nums' as const] },
} as const;

// Easing identical to CSS cubic-bezier(0.2, 0.9, 0.2, 1)
export const easing = {
  snap: [0.2, 0.9, 0.2, 1] as const,
};

export const shadows = {
  light: {
    card: {
      shadowColor: '#0E1311',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 2,
    },
    pop: {
      shadowColor: '#0E1311',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 32,
      elevation: 6,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 2,
    },
    pop: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 32,
      elevation: 8,
    },
  },
} as const;

export function getColors(theme: ThemeName): Colors {
  return theme === 'dark' ? darkColors : lightColors;
}

export function getShadows(theme: ThemeName) {
  return theme === 'dark' ? shadows.dark : shadows.light;
}
