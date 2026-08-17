import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, useColorScheme as useSystemColorScheme } from 'react-native';
import { useColorScheme } from 'nativewind';
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
  // NativeWind owns the color scheme. We hand it the PREFERENCE
  // ('system' | 'light' | 'dark') and read back the RESOLVED value. In
  // 'system' mode NativeWind follows the OS and reacts to OS light/dark
  // switches, so `colorScheme` is always the real, current scheme.
  //
  // Root cause of the "Système stuck on light" bug (client 2026-07-27): the
  // old code pushed the *resolved* theme into colorScheme.set(theme). In
  // NativeWind v4 a fixed value forces Appearance and MASKS the phone's real
  // setting — once light had been shown, the OS reading never came back, so
  // "Système" stayed light regardless of the device. Driving NativeWind with
  // the preference (never the resolved value) and reading its resolved
  // colorScheme fixes it for good.
  // NativeWind reste pilote pour ses classes utilitaires, mais ce n est plus
  // lui qui decide du theme rendu — voir plus bas.
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  // Lecture DIRECTE du reglage de l'appareil. Sans elle, le theme du tout
  // premier rendu venait de NativeWind, qui n'a pas encore recu la preference
  // (elle lui est poussee dans l'effet ci-dessus) : l'application s'ouvrait donc
  // en clair une fraction de seconde, puis basculait — ou restait en clair si
  // l'effet tardait. En mode 'system' l'OS est desormais la source de verite des
  // le premier pixel ; NativeWind reste pilote en parallele pour ses classes.
  const systemScheme = useSystemColorScheme();
  const theme: ThemeName =
    preference === 'system'
      ? (systemScheme === 'dark' ? 'dark' : 'light')
      : preference;

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
