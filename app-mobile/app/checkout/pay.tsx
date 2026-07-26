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

export default function CheckoutPayRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { url, orderId } = useLocalSearchParams<{ url?: string; orderId?: string }>();
  const [loading, setLoading] = useState(true);

  const goConfirm = () => {
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
        {url ? (
          <WebView
            source={{ uri: url }}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>{t('checkout.pay.missing')}</Text>
          </View>
        )}
        {url && loading && (
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
