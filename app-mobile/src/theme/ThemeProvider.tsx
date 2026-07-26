import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { colorScheme } from 'nativewind';
import {
  type Colors,
  type ThemeName,
  getColors,
  getShadows,
  radii,
  spacing,
  typography,
  easing,
} from './tokens';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { APP_MAX_WIDTH } from '../lib/layout';

export type ThemePreference = 'light' | 'dark' | 'system';

type Ctx = {
  theme: ThemeName;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: Colors;
  shadows: ReturnType<typeof getShadows>;
  radii: typeof radii;
  spacing: typeof spacing;
  text: typeof typography;
  easing: typeof easing;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = storage.getString(STORAGE_KEYS.themePreference) as ThemePreference | undefined;
  const [preference, setPreferenceState] = useState<ThemePreference>(stored ?? 'system');
  // useColorScheme() is the reactive, RN-recommended source of the OS theme: it
  // re-renders when the value resolves (Android can report null on the very
  // first frame) and on every OS light/dark switch. Fixes "System stuck on
  // light" when the device booted in dark mode (client 2026-07-26) — the old
  // one-shot Appearance.getColorScheme() read never corrected a null-at-init.
  const systemScheme = useColorScheme();
  const systemTheme: ThemeName = systemScheme === 'dark' ? 'dark' : 'light';

  const theme: ThemeName = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    colorScheme.set(theme);
  }, [theme]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    storage.set(STORAGE_KEYS.themePreference, p);
  };

  const value = useMemo<Ctx>(
    () => ({
      theme,
      preference,
      setPreference,
      colors: getColors(theme),
      shadows: getShadows(theme),
      radii,
      spacing,
      text: typography,
      easing,
    }),
    [theme, preference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: value.colors.bg, alignItems: 'center' }} className={theme}>
        {/* Responsive: keep the app in a centered phone-width column on big
            screens (tablets / unfolded foldables). No-op on phones whose width
            is <= APP_MAX_WIDTH. Client 2026-07-26. */}
        <View style={{ flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH }}>
          {children}
        </View>
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
