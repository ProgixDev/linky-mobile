import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Truck, Package, MapPin, Building2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { Text } from '../../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../../src/lib/haptics';
import { useOrder, useSetOrderTracking } from '../../../../src/data/queries';
import { useAuth } from '../../../../src/stores/auth';
import { useToast } from '../../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../../src/lib/api';
import { ActivityIndicator } from 'react-native';
import { DetailStateScreen } from '../../../../src/components/feedback/DetailState';

interface Carrier {
  id: 'jefa' | 'sopex' | 'self' | 'pickup';
  label: string;
  desc: string;
  Icon: LucideIcon;
}

// Phase I.8 — CARRIERS carries i18n keys ; component memos resolved list.
// IMPORTANT : the label sent to the backend in the carrier field MUST stay
// language-stable (buyer-side timeline reads "Jefa Delivery" not the
// translated word) ; the rendered label is per-language for UX.
const CARRIER_DEFS = [
  { id: 'jefa' as const, labelKey: 'seller.shipCarrierJefaLabel', descKey: 'seller.shipCarrierJefaDesc', Icon: Truck },
  { id: 'sopex' as const, labelKey: 'seller.shipCarrierSopexLabel', descKey: 'seller.shipCarrierSopexDesc', Icon: Package },
  { id: 'self' as const, labelKey: 'seller.shipCarrierSelfLabel', descKey: 'seller.shipCarrierSelfDesc', Icon: MapPin },
  { id: 'pickup' as const, labelKey: 'seller.shipCarrierPickupLabel', descKey: 'seller.shipCarrierPickupDesc', Icon: Building2 },
];
// Stable backend labels (FR, source of truth on server). Used in
// shipMutation regardless of UI language so the buyer timeline stays
// consistent across languages.
const CARRIER_BACKEND_LABELS: Record<Carrier['id'], string> = {
  jefa: 'Jefa Delivery',
  sopex: 'SOPEX Express',
  self: 'Je livre moi-même',
  pickup: 'Retrait sur place',
};

export default function ShipRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [carrier, setCarrier] = useState<Carrier['id']>('jefa');
  const [tracking, setTracking] = useState('');
  const CARRIERS: Carrier[] = useMemo(
    () =>
      CARRIER_DEFS.map((c) => ({
        id: c.id,
        Icon: c.Icon,
        label: t(c.labelKey),
        desc: t(c.descKey),
      })),
    [t],
  );
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);
  const toast = useToast();
  // Phase X.6b — real submit. Pre-X6b the button was haptic + router.replace
  // with no backend call ; the buyer never got the promised notification and
  // the order never flipped to 'preparing'.
  const shipMutation = useSetOrderTracking();

  // Phase T.2 — owner check. Same pattern as the order-detail mirror.
  // T.2.fix — also treat null meId as NOT owner ; fails open today only
  // because every seller-side caller is authed, but cheap to harden.
  const wrongOwner = !isLoading && !!order && (!meId || order.sellerId !== meId);
  useEffect(() => {
    if (wrongOwner) {
      toast.show(t('seller.shipWrongOwner'), 'info');
      router.replace('/(tabs)');
    }
  }, [wrongOwner, toast]);

  const trackingRequired = carrier === 'jefa' || carrier === 'sopex';
  const valid = !trackingRequired || tracking.length >= 4;

  if (isLoading || wrongOwner) {
    // Spinner (not a blank screen) while loading or during the brief
    // wrong-owner redirect — on 3G the blank view read as a frozen screen.
    return <DetailStateScreen loading title={t('seller.shipTitle')} />;
  }
  if (isError && !order) {
    return (
      <DetailStateScreen loading={false} title={t('seller.shipTitle')} onRetry={() => void refetch()} />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader
          title={t('seller.shipTitle')}
          subtitle={t('seller.shipSubtitle')}
        />

        <View style={{ paddingHorizontal: 24, gap: 10 }}>
          {CARRIERS.map((c) => (
            <CarrierRow
              key={c.id}
              carrier={c}
              selected={carrier === c.id}
              onPress={() => setCarrier(c.id)}
            />
          ))}
        </View>

        {/* Tracking number */}
        {trackingRequired && (
          <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: colors.textFaint,
                letterSpacing: 0.6,
                marginBottom: 10,
              }}
            >
              {t('seller.shipTrackingLabel')}
            </Text>
            <View
              style={{
                height: 56,
                paddingHorizontal: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Package size={18} color={colors.textMuted} strokeWidth={1.75} />
              <TextInput
                value={tracking}
                onChangeText={setTracking}
                placeholder={t('seller.shipTrackingPlaceholder')}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                // Server validates ≤ 60 chars (set-order-tracking valid()) ;
                // mirror here so we never pop a 400 for a runaway paste.
                maxLength={60}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: '600',
                  color: colors.text,
                  letterSpacing: 0.5,
                  padding: 0,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                marginTop: 8,
                letterSpacing: 0,
                lineHeight: 16,
              }}
            >
              {t('seller.shipTrackingHint')}
            </Text>
          </View>
        )}
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          disabled={!valid || shipMutation.isPending || !id}
          onPress={async () => {
            if (!id || shipMutation.isPending) return;
            haptic.medium();
            try {
              const trimmed = tracking.trim();
              // Phase X.12 — send the human-readable carrier LABEL
              // ("Jefa Delivery") rather than the internal id ("jefa") so
              // the buyer's order-detail timeline reads cleanly. CARRIERS
              // is a fixed V1 list, so .find() is exhaustive ; the `?? carrier`
              // fallback is paranoia for a future enum addition.
              // Phase I.8 — backend gets the STABLE FR label so the buyer
              // timeline reads "Jefa Delivery" regardless of UI language.
              const carrierLabel = CARRIER_BACKEND_LABELS[carrier] ?? carrier;
              await shipMutation.mutateAsync({
                orderId: id,
                trackingNumber: trimmed.length > 0 ? trimmed : undefined,
                carrier: carrierLabel,
              });
              toast.show(t('seller.shipSuccess'), 'success');
              router.replace(`/seller/orders/${id}`);
            } catch (e) {
              toast.show(toToastMessage(e, t('seller.shipError')), 'danger');
            }
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: valid && !shipMutation.isPending ? colors.text : colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: valid && !shipMutation.isPending ? 1 : 0.6,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          {shipMutation.isPending && (
            <ActivityIndicator size="small" color={valid ? colors.bg : colors.textFaint} />
          )}
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: valid && !shipMutation.isPending ? colors.bg : colors.textFaint,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {shipMutation.isPending ? t('seller.shipSending') : t('seller.shipSubmit')}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function CarrierRow({
  carrier,
  selected,
  onPress,
}: {
  carrier: Carrier;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.card,
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: selected ? colors.bg : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <carrier.Icon size={20} color={selected ? colors.primary : colors.text} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14.5,
            fontWeight: '700',
            color: colors.text,
            letterSpacing: 0,
            lineHeight: 18,
            includeFontPadding: false,
          }}
        >
          {carrier.label}
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            color: colors.textMuted,
            marginTop: 2,
            letterSpacing: 0,
            lineHeight: 16,
          }}
        >
          {carrier.desc}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          backgroundColor: selected ? colors.primary : 'transparent',
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
      </View>
    </Pressable>
  );
}
