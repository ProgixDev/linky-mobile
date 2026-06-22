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
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAuthStore, useProtectedRoute } from '@/features/auth';
import { useDeliveriesStore } from '@/features/deliveries';
import '@/shared/lib/env'; // fail fast on invalid environment
import { registerSupabaseAutoRefresh } from '@/shared/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Load the session once, keep it fresh while foregrounded, and route-guard.
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().init();
    const stopAutoRefresh = registerSupabaseAutoRefresh();
    // On sign-out, drop any cached deliveries so the next driver on this device
    // never sees the previous driver's list (spec 001 AC-9).
    const unsubAuth = useAuthStore.subscribe((state, prev) => {
      if (state.status === 'unauthenticated' && prev.status !== 'unauthenticated') {
        useDeliveriesStore.getState().clearCache();
      }
    });
    return () => {
      unsubscribe();
      stopAutoRefresh();
      unsubAuth();
    };
  }, []);

  useProtectedRoute();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}
