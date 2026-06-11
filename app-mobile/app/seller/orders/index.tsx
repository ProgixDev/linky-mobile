import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
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
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useSellerOrders } from '../../../src/data/queries';
import { formatGNF, formatRelativeFR } from '../../../src/lib/format';
import type { Order, OrderStatus } from '../../../src/data/types';

type Filter = 'all' | 'todo' | 'shipping' | 'done';

const FILTERS: { id: Filter; label: string; statuses?: OrderStatus[] }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'todo', label: 'À expédier', statuses: ['paid', 'placed'] },
  { id: 'shipping', label: 'En cours', statuses: ['preparing'] },
  { id: 'done', label: 'Terminées', statuses: ['delivered', 'released'] },
];

const STATUS_META: Record<OrderStatus, { label: string; Icon: LucideIcon; bg: string; fg: string }> = {
  placed: { label: 'À PRÉPARER', Icon: Clock, bg: '#FCE7D3', fg: '#A04D08' },
  paid: { label: 'À PRÉPARER', Icon: Clock, bg: '#FCE7D3', fg: '#A04D08' },
  preparing: { label: 'EN ROUTE', Icon: Truck, bg: '#FCF1DC', fg: '#8B5A0A' },
  delivered: { label: 'LIVRÉE', Icon: Package, bg: '#E0F0E8', fg: '#155F45' },
  released: { label: 'PAYÉE', Icon: CheckCircle2, bg: '#E8F2EE', fg: '#0A5240' },
  disputed: { label: 'LITIGE', Icon: CircleAlert, bg: '#FBE7E5', fg: '#B53D2F' },
  cancelled: { label: 'ANNULÉE', Icon: Ban, bg: '#EEEEEE', fg: '#606060' },
  refunded: { label: 'REMBOURSÉE', Icon: RotateCcw, bg: '#E8EFF6', fg: '#1F4E7A' },
};

const STATUS_FALLBACK = { label: '—', Icon: CircleAlert, bg: '#EEEEEE', fg: '#606060' } as const;

export default function SellerOrdersIndex() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('todo');
  const ordersQuery = useSellerOrders();
  const orders = ordersQuery.data;

  const filtered = (orders ?? []).filter((o) => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f?.statuses) return true;
    return f.statuses.includes(o.status);
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isFetching && !ordersQuery.isLoading}
            onRefresh={() => void ordersQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader
          title="Commandes reçues"
          subtitle="Prépare, expédie et reçois ton paiement."
        />

        {/* Phase U.0 should-fix — exclusive error : was co-rendering with
            the chips + an "Aucune commande reçue" empty state, all at once.
            Now the error replaces the list region entirely while keeping
            the header. */}
        {ordersQuery.isError ? (
          <View style={{ paddingTop: 20 }}>
            <ErrorStateView onRetry={() => void ordersQuery.refetch()} />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 14 }}
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
                      height: 36,
                      paddingHorizontal: 14,
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
            </ScrollView>

            <View style={{ paddingHorizontal: 24, gap: 10 }}>
              {ordersQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={84} radius={18} />
                ))
              ) : (
                <>
                  {filtered.map((o) => (
                    <SellerOrderRow
                      key={o.id}
                      order={o}
                      onPress={() => router.push(`/seller/orders/${o.id}`)}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}>
                      <Package size={22} color={colors.textFaint} strokeWidth={1.75} />
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                        {/* U.0 should-fix — copy was wrong when a filter
                            other than "Toutes" was active. */}
                        {(orders?.length ?? 0) > 0
                          ? 'Aucune commande dans ce filtre'
                          : 'Aucune commande reçue'}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {(orders?.length ?? 0) > 0
                          ? 'Bascule sur Toutes pour voir tes autres ventes.'
                          : "Les commandes apparaîtront ici dès qu'un client passera commande."}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SellerOrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = STATUS_META[order.status] ?? { ...STATUS_FALLBACK, label: order.status.toUpperCase() };
  const needsAction = order.status === 'paid' || order.status === 'placed';

  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: needsAction ? 1.5 : 1,
        borderColor: needsAction ? colors.accent : colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Image
          source={order.productSnapshot.photo}
          style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgSunken }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                  fontSize: 9.5,
                  fontWeight: '700',
                  color: meta.fg,
                  lineHeight: 11,
                  includeFontPadding: false,
                  letterSpacing: 0.3,
                }}
              >
                {meta.label}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textFaint }}>· {order.reference}</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, color: colors.textFaint }}>
              {formatRelativeFR(order.createdAt)}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
              marginTop: 6,
              letterSpacing: 0,
              lineHeight: 18,
              includeFontPadding: false,
            }}
            numberOfLines={1}
          >
            {order.productSnapshot.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {/* Phase T.4 — fee model fix. Verified 2026-06-10: the buyer
                  pays the 3% on top ; the seller receives the FULL
                  amount_minor. The previous "amount - fees" + "net après
                  frais" label was misleading and conflicted with the
                  detail screen below (BreakLine "Tu recevras" already
                  shows order.amountGnf). */}
              {formatGNF(order.amountGnf)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>
              · tu reçois
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
      </View>
    </Pressable>
  );
}
