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
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useAuthStore, useProtectedRoute } from '@/features/auth';
import { useDeliveriesStore } from '@/features/deliveries';
import { useNotificationObservers, useNotificationsStore } from '@/features/notifications';
import { useLivreurGate, useOnboardingStore } from '@/features/onboarding';
import { useWelcomeGate, useWelcomeStore } from '@/features/welcome';
import { ErrorBoundary } from '@/shared/ui';
import '@/shared/lib/env'; // fail fast on invalid environment
import { configureForegroundHandler } from '@/shared/lib/push';

SplashScreen.preventAutoHideAsync();
// How a push is shown while the app is foregrounded (banner + sound + badge).
configureForegroundHandler();

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
        // On sign-out, drop cached deliveries (spec 001 AC-9) + the gate state + the
        // notifications inbox so the next courier on this device starts clean. (The
        // device push token is unregistered inside auth's signOut, before this fires.)
        useDeliveriesStore.getState().clearCache();
        useOnboardingStore.getState().reset();
        useNotificationsStore.getState().reset();
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
  const onboardingStatus = useOnboardingStore((s) => s.appStatus);
  useProtectedRoute({ welcomeSeen });
  useWelcomeGate({ authStatus, welcomeSeen });
  useLivreurGate({ authStatus, roles });

  // Push is enabled only for an authenticated + APPROVED livreur — that gates the
  // permission prompt to a contextual moment (never the cold first launch). A foreground
  // delivery push refreshes the worklist; wiring deliveries↔notifications here keeps both
  // features free of a cross-feature import (module boundaries).
  const pushEnabled =
    authStatus === 'authenticated' &&
    ((roles?.includes('livreur') ?? false) || onboardingStatus === 'approved');
  const refreshDeliveries = useCallback(() => {
    void useDeliveriesStore.getState().refresh();
  }, []);
  useNotificationObservers({ enabled: pushEnabled, onForegroundDelivery: refreshDeliveries });

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
        {/* Light (white) status-bar content — it sits on the green top band the Screen
            renders, so the time / wifi / battery stay legible (a white top hid them). */}
        <StatusBar style="light" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
