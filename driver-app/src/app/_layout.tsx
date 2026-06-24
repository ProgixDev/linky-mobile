import '../global.css';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useAuthStore, useProtectedRoute } from '@/features/auth';
import { useDeliveriesStore } from '@/features/deliveries';
import { useLivreurGate, useOnboardingStore } from '@/features/onboarding';
import { useWelcomeGate, useWelcomeStore } from '@/features/welcome';
import { ErrorBoundary } from '@/shared/ui';
import '@/shared/lib/env'; // fail fast on invalid environment

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Boot the session once (validate the stored Linky refresh token), then route-guard.
  // The access token is refreshed lazily by the api layer on a 401 — no Supabase
  // Auth auto-refresh, because this app uses the Linky self-rolled JWT.
  useEffect(() => {
    void useAuthStore.getState().init();
    // Load the first-run welcome flag so the pre-auth welcome gate can decide.
    void useWelcomeStore.getState().hydrate();
    const unsubAuth = useAuthStore.subscribe((state, prev) => {
      if (state.status === 'unauthenticated' && prev.status !== 'unauthenticated') {
        // On sign-out, drop cached deliveries (spec 001 AC-9) + the gate state so the
        // next courier on this device starts clean.
        useDeliveriesStore.getState().clearCache();
        useOnboardingStore.getState().reset();
      }
      if (state.status === 'authenticated' && prev.status !== 'authenticated') {
        // Just signed in → check the livreur approval gate.
        void useOnboardingStore.getState().refresh();
      }
    });
    // Re-check the gate on app foreground (an admin may have approved while away).
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && useAuthStore.getState().status === 'authenticated') {
        void useOnboardingStore.getState().refresh();
      }
    });
    return () => {
      unsubAuth();
      appStateSub.remove();
    };
  }, []);

  // Auth guard (unauthenticated → sign-in) + livreur approval gate (approved → deliveries
  // home, otherwise → /onboarding). The gate reads auth state passed in from this layer so
  // the onboarding feature stays free of a cross-feature import.
  const authStatus = useAuthStore((s) => s.status);
  const roles = useAuthStore((s) => s.user?.roles);
  const welcomeSeen = useWelcomeStore((s) => s.seen);
  useProtectedRoute({ welcomeSeen });
  useWelcomeGate({ authStatus, welcomeSeen });
  useLivreurGate({ authStatus, roles });

  // Hold the native splash until fonts + session + the welcome flag have resolved,
  // so the route guards settle before the first frame (no home/sign-in flash).
  useEffect(() => {
    if ((fontsLoaded || fontError) && welcomeSeen !== null && authStatus !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, welcomeSeen, authStatus]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <KeyboardProvider>
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false }} />
        </ErrorBoundary>
        <StatusBar style="auto" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
