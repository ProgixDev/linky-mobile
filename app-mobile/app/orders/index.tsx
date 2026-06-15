import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import {
  Package,
  Clock,
  Truck,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  Ban,
  RotateCcw,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { I } from '../../src/icons/Icon';
import { haptic } from '../../src/lib/haptics';
import { useMyOrders } from '../../src/data/queries';
import { formatGNF } from '../../src/lib/format';
import type { Order, OrderStatus } from '../../src/data/types';

type Filter = 'all' | 'active' | 'completed';

// Phase I.8 — colors + icon are constants ; only the label is i18n-driven,
// so the static map carries a translation KEY and the row resolves it with
// t() at render time. This is the canonical fix for module-scope label
// arrays that would otherwise freeze at the language i18next first resolved.
const STATUS_META: Record<OrderStatus, { labelKey: string; Icon: LucideIcon; bg: string; fg: string }> = {
  placed: { labelKey: 'orders.status.placed', Icon: Clock, bg: '#FCF1DC', fg: '#8B5A0A' },
  paid: { labelKey: 'orders.status.paid', Icon: Clock, bg: '#FCF1DC', fg: '#8B5A0A' },
  preparing: { labelKey: 'orders.status.preparing', Icon: Truck, bg: '#FCF1DC', fg: '#8B5A0A' },
  delivered: { labelKey: 'orders.status.delivered', Icon: Package, bg: '#E0F0E8', fg: '#155F45' },
  released: { labelKey: 'orders.status.released', Icon: CheckCircle2, bg: '#E8F2EE', fg: '#0A5240' },
  disputed: { labelKey: 'orders.status.disputed', Icon: CircleAlert, bg: '#FBE7E5', fg: '#B53D2F' },
  cancelled: { labelKey: 'orders.status.cancelled', Icon: Ban, bg: '#EEEEEE', fg: '#606060' },
  refunded: { labelKey: 'orders.status.refunded', Icon: RotateCcw, bg: '#E8EFF6', fg: '#1F4E7A' },
};

// Defensive fallback for any future status the client hasn't been taught about
// yet — surfaces the raw status code instead of crashing the row.
const STATUS_FALLBACK = { labelKey: 'states.empty', Icon: CircleAlert, bg: '#EEEEEE', fg: '#606060' } as const;

export default function OrdersIndex() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: orders = [] } = useMyOrders();

  const FILTERS: { id: Filter; label: string }[] = useMemo(
    () => [
      { id: 'all', label: t('orders.filterAll') },
      { id: 'active', label: t('orders.filterActive') },
      { id: 'completed', label: t('orders.filterCompleted') },
    ],
    [t],
  );

  const filtered = orders.filter((o) => {
    if (filter === 'active') return ['placed', 'paid', 'preparing'].includes(o.status);
    if (filter === 'completed') return ['delivered', 'released'].includes(o.status);
    return true;
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('orders.title')}
          subtitle={t('orders.subtitle')}
          trailing={
            <Pressable
              onPress={() => {
                haptic.light();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new route, regenerates on next expo start
                router.push('/scan' as any);
              }}
              accessibilityLabel={t('orders.scanQr')}
              style={{
                height: 40,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <I.qr size={14} color={colors.text} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text }}>{t('orders.scan')}</Text>
            </Pressable>
          }
        />

        {/* Filter chips */}
        <View
          style={{
            paddingHorizontal: 24,
            marginBottom: 14,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  haptic.selection();
                  setFilter(f.id);
                }}
                style={{
                  paddingHorizontal: 14,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: active ? colors.text : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.text : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: active ? colors.bg : colors.text,
                    letterSpacing: 0,
                    lineHeight: 15,
                    includeFontPadding: false,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 24, gap: 10 }}>
          {filtered.map((o) => (
            <OrderRow key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
          ))}
          {filtered.length === 0 && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('orders.empty')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Phase I.8 — resolve the labelKey at render time so the status pill flips
  // language live. Unknown statuses fall through to the raw uppercase code.
  const metaBase = STATUS_META[order.status];
  const meta = metaBase
    ? { ...metaBase, label: t(metaBase.labelKey) }
    : { ...STATUS_FALLBACK, label: order.status.toUpperCase() };
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Image
          source={order.productSnapshot.photo}
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: colors.bgSunken,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <View
              style={{
                paddingHorizontal: 8,
                height: 20,
                borderRadius: 999,
                backgroundColor: meta.bg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
            >
              <meta.Icon size={10} color={meta.fg} strokeWidth={2.25} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: meta.fg,
                  lineHeight: 12,
                  includeFontPadding: false,
                  letterSpacing: 0.3,
                }}
              >
                {meta.label}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textFaint, fontVariant: ['tabular-nums'] }}>
              · {order.reference}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
              letterSpacing: 0,
              lineHeight: 18,
              includeFontPadding: false,
            }}
            numberOfLines={1}
          >
            {order.productSnapshot.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.text,
                fontVariant: ['tabular-nums'],
                letterSpacing: 0,
              }}
            >
              {formatGNF(order.totalGnf)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>
              · {t('orders.quantity', { count: order.quantity })}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
      </View>
    </Pressable>
  );
}
