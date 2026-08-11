// In-app mobile-money payment (client 2026-07-26). The Lengopay hosted page
// (Orange Money / MTN) renders INSIDE the app in a WebView instead of opening
// the external browser — the buyer never leaves Linky. On "J'ai payé" (or
// close) we route to the confirmation screen, which polls the real payment
// status (the cron confirms it), so the outcome is authoritative regardless of
// what the page showed.
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';

// Security (audit MOB-WEBVIEW-DEEPLINK): this screen is deep-linkable
// (linky://checkout/pay?url=...), so the `url` param is attacker-controllable.
// Only load it if it is an https:// page on a Lengopay host (the hosted
// Orange Money / MTN payment page). Otherwise an attacker could render a
// look-alike page inside Linky's trusted "Paiement" chrome to phish the
// buyer's mobile-money PIN/OTP. Anything else is rejected (treated as missing).
function isTrustedPaymentUrl(raw?: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return /^https:\/\/([a-z0-9-]+\.)*lengopay\.com(\/|$|\?|#)/i.test(raw);
}

export default function CheckoutPayRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { url, orderId, bookingId } = useLocalSearchParams<{ url?: string; orderId?: string; bookingId?: string }>();
  const safeUrl = isTrustedPaymentUrl(url) ? url : undefined;
  const [loading, setLoading] = useState(true);

  const goConfirm = () => {
    // Booking payment (Orange/MTN): return to the booking detail, which refetches
    // and shows 'paid' once the cron confirms the rail.
    if (bookingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
      router.replace(`/bookings/${bookingId}` as any);
      return;
    }
    if (!orderId) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; route exists on disk.
    router.replace(`/checkout/confirm/${orderId}` as any);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={goConfirm}
          hitSlop={10}
          accessibilityLabel={t('checkout.pay.close')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 }}>
          {t('checkout.pay.title')}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        {safeUrl ? (
          <WebView
            source={{ uri: safeUrl }}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            // Keep the WHOLE payment flow INSIDE the app (client 2026-07-30:
            // wants zero external browser / app switch). Three settings:
            //  - setSupportMultipleWindows=false + javaScriptCanOpenWindowsAutomatically:
            //    window.open / target=_blank load in THIS WebView, not Chrome.
            //  - onShouldStartLoadWithRequest: allow only http(s) (they render
            //    in-app); refuse any other scheme (intent://, custom app links,
            //    tel:) so nothing can hand off to an external app. The Orange
            //    Money / MTN flow confirms via a USSD code on the SIM (a system
            //    prompt, not an app), so this never blocks a real payment.
            //  - third-party / shared cookies: the hosted payment session needs
            //    them to persist across its redirects.
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically
            // Security (2026-07-31 audit): only https navigations inside the
            // payment flow — never plaintext http:// (PIN/OTP over cleartext on
            // Guinea 3G / public wifi). Legit operator/bank redirects are https.
            onShouldStartLoadWithRequest={(r) => r.url.startsWith('https://')}
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>{t('checkout.pay.missing')}</Text>
          </View>
        )}
        {safeUrl && loading && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg,
            }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text
          variant="micro"
          tone="muted"
          style={{ textAlign: 'center', marginBottom: 8, letterSpacing: 0, textTransform: 'none', lineHeight: 15 }}
        >
          {t('checkout.pay.hint')}
        </Text>
        <Button size="lg" block label={t('checkout.pay.done')} onPress={goConfirm} />
      </View>
    </SafeAreaView>
  );
}
