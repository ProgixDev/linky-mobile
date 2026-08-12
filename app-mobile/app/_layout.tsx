import '../global.css';
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { setOnSessionLost } from '../src/lib/api';
import { useAuth } from '../src/stores/auth';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as SplashScreen from 'expo-splash-screen';
import { I18nextProvider } from 'react-i18next';
import { useFonts } from 'expo-font';
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { ToastProvider } from '../src/components/feedback/Toast';
import { UpdateBanner } from '../src/components/feedback/UpdateBanner';
import { usePushRegistration, useNotificationTapRouting } from '../src/lib/push';

void SplashScreen.preventAutoHideAsync().catch(() => {});

// Phase Q — Stripe payment sheet (card + Google Pay). TEST publishable key;
// LIVE swap is an env change. merchantIdentifier (Apple Pay) is V1.1 — needs
// the Apple Developer account.
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

// Renders nothing — hosts the push side effects (token registration while
// authed, notification tap → deeplink routing).
function PushBootstrap() {
  usePushRegistration();
  useNotificationTapRouting();
  return null;
}

export default function RootLayout() {
  // For V1 we ship system fonts as fallback. Drop Cabinet Grotesk + Inter into assets/fonts to enable.
  const [fontsLoaded, fontError] = useFonts({
    // 'CabinetGrotesk-Bold': require('../assets/fonts/CabinetGrotesk-Bold.otf'),
    // 'CabinetGrotesk-Regular': require('../assets/fonts/CabinetGrotesk-Regular.otf'),
    // 'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    // 'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    // 'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Session definitivement refusee par le serveur : on deconnecte pour de bon.
  // Sans ca, les jetons etaient effaces du stockage mais l'ecran restait celui
  // d'un utilisateur connecte — chaque action echouait alors sur « Session
  // invalide ou expiree », sans aucune issue proposee (client 2026-08-11).
  // Enregistre ici plutot qu'importe depuis api.ts : l'import inverse creerait
  // un cycle avec data/queries/auth.
  useEffect(() => {
    setOnSessionLost(() => {
      void useAuth.getState().signOut();
      router.replace('/(onboarding)/welcome');
    });
    return () => setOnSessionLost(null);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="linky">
        <SafeAreaProvider>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <I18nextProvider i18n={i18n}>
                <ThemeProvider>
                  <BottomSheetModalProvider>
                    <ToastProvider>
                      <PushBootstrap />
                      <StatusBar style="auto" />
                      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                        <Stack.Screen name="(onboarding)" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen
                          name="product/[id]"
                          options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="property/[id]"
                          options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="shop/[id]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen name="cart" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="checkout" options={{ animation: 'slide_from_right' }} />
                        {/* Phase V.3d -- /order/[id]/confirm is the SOLE QR-flow deep link.
                          The legacy /orders/[id]/confirm-receipt route was deleted
                          (zero internal callers ; deep-linkable mock screen). */}
                        <Stack.Screen
                          name="order/[id]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="track/[id]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="review/[orderId]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="wallet/index"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="wallet/recharger"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="wallet/retirer"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="wallet/envoyer"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen name="create/index" options={{ presentation: 'modal' }} />
                        {/* Phase T.2 fix — the create/product/* and
                          create/property/* per-step Stack.Screen entries
                          are now owned by the role-gated _layout.tsx files
                          under those subdirs (see
                          app/create/product/_layout.tsx +
                          app/create/property/_layout.tsx) ; the wizard
                          layouts set animation: 'slide_from_right' in
                          their screenOptions. Keeping the entries here
                          would clash with the nested Stack and expo-router
                          would warn + drop the animation. */}
                        <Stack.Screen
                          name="messages/index"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="messages/[id]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="notifications"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="kyc/intro"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen name="kyc/pending" options={{ animation: 'fade' }} />
                        <Stack.Screen name="kyc/return" options={{ animation: 'fade' }} />
                        <Stack.Screen
                          name="dispute/[orderId]"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="settings/index"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="settings/phones"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="settings/theme"
                          options={{ animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                          name="settings/data-saver"
                          options={{ animation: 'slide_from_right' }}
                        />
                      </Stack>
                      {/* Sits above every screen : a downloaded update can be
                          applied in ONE restart instead of two (client
                          2026-08-05 — testers kept running stale bundles). */}
                      <UpdateBanner />
                    </ToastProvider>
                  </BottomSheetModalProvider>
                </ThemeProvider>
              </I18nextProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
