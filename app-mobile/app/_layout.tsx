import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { I18nextProvider } from 'react-i18next';
import { useFonts } from 'expo-font';
import i18n from '../src/i18n';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { ToastProvider } from '../src/components/feedback/Toast';
import { usePushRegistration, useNotificationTapRouting } from '../src/lib/push';

// Single QueryClient at module scope — do NOT instantiate inside the component.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: 3,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

void SplashScreen.preventAutoHideAsync().catch(() => {});

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                      <Stack.Screen name="shop/[id]" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="cart" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="checkout" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="wallet/index" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="wallet/recharger" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="wallet/retirer" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/index" options={{ presentation: 'modal' }} />
                      <Stack.Screen name="create/product/seller" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/product/category" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/product/details" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/product/photos" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/product/preview" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/property/details" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="create/property/location" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="messages/index" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="messages/[id]" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="kyc/intro" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="kyc/pending" options={{ animation: 'fade' }} />
                      <Stack.Screen name="kyc/return" options={{ animation: 'fade' }} />
                      <Stack.Screen name="dispute/[orderId]" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="settings/index" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="settings/phones" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="settings/theme" options={{ animation: 'slide_from_right' }} />
                      <Stack.Screen name="settings/data-saver" options={{ animation: 'slide_from_right' }} />
                    </Stack>
                  </ToastProvider>
                </BottomSheetModalProvider>
              </ThemeProvider>
            </I18nextProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
