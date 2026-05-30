import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronDown,
  TrendingUp,
  Star,
  Eye,
  Heart,
  MoreVertical,
  Megaphone,
  MessageSquare,
  Sparkles as SparklesIcon,
  BarChart3,
  Zap,
  ArrowUpRight,
  Package,
  Clock,
  Building2,
  Home as HomeIcon,
  CalendarDays,
  KeyRound,
  MapPin,
  BedDouble,
  Trash2,
  Check,
  Pause,
  CircleDot,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { NoiseOverlay } from '../visuals/NoiseOverlay';
import { haptic } from '../../lib/haptics';
import { formatGNF } from '../../lib/format';
import { mockShops } from '../../data/mockShops';
import { mockProperties } from '../../data/mockProperties';
import {
  useProducts,
  useMyShops,
  useMyProperties,
  useSetProductStatus,
  useSetPropertyStatus,
  useDeleteProduct,
  useDeleteProperty,
} from '../../data/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../sheets/Sheet';
import { useToast } from '../feedback/Toast';
import { ApiError, toToastMessage } from '../../lib/api';

export type ProMode = 'shop' | 'estate';

const VIEW_BARS = [
  40, 55, 35, 70, 60, 80, 45, 90, 75, 60, 95, 70, 85, 100, 80, 75, 90, 65, 50, 85, 95, 70, 80, 100,
  90, 75, 65, 90, 85, 100,
];

// =================================================================
// Identity pill — shared header element
// =================================================================

export function IdentityPill({ mode }: { mode: ProMode }) {
  const { colors } = useTheme();
  const shop = mockShops[0]!;
  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 6,
        paddingRight: 14,
        height: 48,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Image
        source={shop.avatar}
        style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: colors.bgSunken }}
        contentFit="cover"
      />
      <View>
        <Text
          style={{
            fontSize: 14.5,
            fontWeight: '700',
            color: colors.text,
            letterSpacing: 0,
            lineHeight: 17,
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {mode === 'shop' ? shop.name : 'Agence Aïssatou'}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.4,
            marginTop: 2,
          }}
        >
          {mode === 'shop' ? 'BOUTIQUE' : 'AGENCE IMMO'}
        </Text>
      </View>
      <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

export function ModeTab({
  Icon,
  label,
  active,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
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
        flex: 1,
        height: 40,
        borderRadius: 999,
        backgroundColor: active ? colors.bg : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Icon size={14} color={active ? colors.text : colors.textMuted} strokeWidth={1.75} />
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: '600',
          color: active ? colors.text : colors.textMuted,
          letterSpacing: 0,
          lineHeight: 16,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// =================================================================
// Shop (Vendor) dashboard
// =================================================================

type ManagementTarget = { kind: 'product' | 'property'; id: string; current?: string; title?: string };

export function ShopDashboard() {
  const { colors } = useTheme();
  const { data: shops } = useMyShops();
  const myShop = shops?.[0];
  const { data: products } = useProducts({ shopId: myShop?.id });
  const { data: properties } = useMyProperties();
  const setProductStatus = useSetProductStatus();
  const setPropertyStatus = useSetPropertyStatus();
  const deleteProduct = useDeleteProduct();
  const deleteProperty = useDeleteProperty();
  const toast = useToast();
  const qc = useQueryClient();
  const [statusTarget, setStatusTarget] = useState<ManagementTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagementTarget | null>(null);

  return (
    <View>
      <View style={{ paddingHorizontal: 20 }}>
        <RevenueHero
          label="REVENUS · 30 JOURS"
          value="2,4M"
          unit="GNF"
          subline="18 commandes · panier moyen 133 000 GNF"
          trend="+18 %"
        />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <QuickAction
            Icon={Package}
            label="Commandes"
            onPress={() => router.push('/seller/orders')}
            badge="3"
            accent
          />
          <QuickAction
            Icon={MessageSquare}
            label="Demandes"
            onPress={() => router.push('/pro/demandes')}
            badge="3"
            accent
          />
          <QuickAction
            Icon={Zap}
            label="Booster"
            onPress={() => router.push('/pro/boost')}
          />
          <QuickAction
            Icon={BarChart3}
            label="Stats"
            onPress={() => router.push('/pro/stats')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <QuickAction
            Icon={Megaphone}
            label="Promo"
            onPress={() => router.push('/pro/promo')}
            badge="2"
          />
          <QuickAction
            Icon={ArrowUpRight}
            label="Versements"
            onPress={() => router.push('/seller/payouts')}
          />
          <QuickAction
            Icon={Clock}
            label="Litiges"
            onPress={() => router.push('/seller/refunds')}
          />
          <QuickAction
            Icon={Star}
            label="Avis"
            onPress={() => {}}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 22, flexDirection: 'row', gap: 10 }}>
        <StatTile Icon={Package} label="Annonces" value="42" sub="2 boostées" />
        <StatTile
          Icon={Clock}
          label="En attente"
          value="3"
          sub="Action requise"
          subTone="accent"
        />
        <StatTile Icon={Star} label="Note" value="4.9" sub="124 avis" />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <ViewsChart bars={VIEW_BARS} title="VUES · 30 JOURS" value="4 280" trend="+24 %" />
      </View>

      {shops === undefined ? null : !myShop ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <SectionTitle title="Mes annonces" />
          <Pressable
            onPress={() => {
              haptic.light();
              router.push('/create');
            }}
            style={{
              padding: 20,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.border,
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Package size={20} color={colors.textMuted} strokeWidth={1.75} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, letterSpacing: 0 }}>
              Crée ta première annonce
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }}>
              Ta boutique se crée à la première publication.
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <SectionTitle title="Mes annonces" />
          {(!products?.length && !properties?.length) ? (
            <View
              style={{
                padding: 20,
                borderRadius: 18,
                backgroundColor: colors.card,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.border,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Package size={20} color={colors.textMuted} strokeWidth={1.75} />
              <Text style={{ fontSize: 13.5, color: colors.text, fontWeight: '600' }}>
                Tu n'as pas encore d'annonce.
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
                Tape sur + pour publier.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {products?.map((p) => (
                <ManagementRow
                  key={`p-${p.id}`}
                  kind="product"
                  title={p.title}
                  price={formatGNF(p.priceGnf)}
                  cover={p.photos[0]}
                  status={p.status}
                  onPress={() => router.push(`/product/${p.id}`)}
                  onStatus={() => setStatusTarget({ kind: 'product', id: p.id, current: p.status })}
                  onDelete={() => setDeleteTarget({ kind: 'product', id: p.id, title: p.title })}
                />
              ))}
              {properties?.map((p) => (
                <ManagementRow
                  key={`pr-${p.id}`}
                  kind="property"
                  title={p.title}
                  price={`${formatGNF(p.priceGnf)}${p.perMonth ? ' /mois' : ''}`}
                  cover={p.photos[0]}
                  status={p.status}
                  onPress={() => router.push(`/property/${p.id}`)}
                  onStatus={() => setStatusTarget({ kind: 'property', id: p.id, current: p.status })}
                  onDelete={() => setDeleteTarget({ kind: 'property', id: p.id, title: p.title })}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Status change sheet */}
      <Sheet
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title="Changer le statut"
        snapPoints={['45%']}
      >
        <View style={{ padding: 16, gap: 8 }}>
          {(statusTarget?.kind === 'property'
            ? [
                { value: 'active' as const, label: 'Actif', Icon: CircleDot },
                { value: 'paused' as const, label: 'En pause', Icon: Pause },
                { value: 'reserved' as const, label: 'Réservé', Icon: Check },
                { value: 'sold' as const, label: 'Vendu', Icon: Check },
              ]
            : [
                { value: 'active' as const, label: 'Actif', Icon: CircleDot },
                { value: 'paused' as const, label: 'En pause', Icon: Pause },
                { value: 'sold' as const, label: 'Vendu', Icon: Check },
              ]
          ).map((opt) => (
            <Pressable
              key={opt.value}
              disabled={setProductStatus.isPending || setPropertyStatus.isPending}
              onPress={async () => {
                if (!statusTarget) return;
                try {
                  if (statusTarget.kind === 'product') {
                    await setProductStatus.mutateAsync({ id: statusTarget.id, status: opt.value });
                  } else {
                    await setPropertyStatus.mutateAsync({ id: statusTarget.id, status: opt.value });
                  }
                  toast.show(`Statut: ${opt.label}`, 'success');
                  setStatusTarget(null);
                } catch (e: unknown) {
                  console.error('[mes-annonces] status error:', e);
                  toast.show(toToastMessage(e, 'Mise à jour échouée'), 'danger');
                }
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 14,
                backgroundColor: statusTarget?.current === opt.value ? colors.primarySoft : colors.card,
                borderWidth: 1,
                borderColor: statusTarget?.current === opt.value ? colors.primary : colors.border,
              }}
            >
              <opt.Icon size={16} color={colors.text} strokeWidth={2} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }}>
                {opt.label}
              </Text>
              {statusTarget?.current === opt.value && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>ACTUEL</Text>
              )}
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer l'annonce"
        snapPoints={['35%']}
      >
        <View style={{ padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 14, color: colors.text }}>
            « {deleteTarget?.title} » sera définitivement supprimé. Action irréversible.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setDeleteTarget(null)}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 14,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontWeight: '700', color: colors.text }}>Annuler</Text>
            </Pressable>
            <Pressable
              disabled={deleteProduct.isPending || deleteProperty.isPending}
              onPress={async () => {
                if (!deleteTarget) return;
                try {
                  if (deleteTarget.kind === 'product') {
                    await deleteProduct.mutateAsync(deleteTarget.id);
                  } else {
                    await deleteProperty.mutateAsync(deleteTarget.id);
                  }
                  toast.show('Annonce supprimée', 'success');
                  setDeleteTarget(null);
                } catch (e: unknown) {
                  console.error('[mes-annonces] delete error:', e);
                  // 404 means the row is already gone (stale list, double-tap, or another
                  // session deleted it). Treat as success — refresh the lists so the row
                  // disappears, dismiss the sheet, soft toast.
                  if (e instanceof ApiError && e.status === 404) {
                    qc.invalidateQueries({ queryKey: ['products'] });
                    qc.invalidateQueries({ queryKey: ['my-properties'] });
                    qc.invalidateQueries({ queryKey: ['my-shops'] });
                    toast.show('Annonce déjà supprimée', 'info');
                    setDeleteTarget(null);
                    return;
                  }
                  toast.show(toToastMessage(e, 'Suppression échouée'), 'danger');
                }
              }}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 14,
                backgroundColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: (deleteProduct.isPending || deleteProperty.isPending) ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>
                {(deleteProduct.isPending || deleteProperty.isPending) ? 'Suppression…' : 'Supprimer'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function ManagementRow({
  kind,
  title,
  price,
  cover,
  status,
  onPress,
  onStatus,
  onDelete,
}: {
  kind: 'product' | 'property';
  title: string;
  price: string;
  cover: string;
  status: string;
  onPress: () => void;
  onStatus: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const statusLabel =
    status === 'paused' ? 'En pause'
    : status === 'sold' ? 'Vendu'
    : status === 'reserved' ? 'Réservé'
    : status === 'pending' ? 'En attente'
    : 'Actif';
  const statusTone =
    status === 'active' ? colors.primarySoft
    : status === 'paused' ? colors.bgSunken
    : colors.accentSoft;
  const statusFg =
    status === 'active' ? colors.primaryDeep
    : status === 'paused' ? colors.textMuted
    : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Image
        source={cover}
        style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.bgSunken }}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.4 }}>
          {kind === 'product' ? 'PRODUIT' : 'BIEN'}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 13.5, fontWeight: '600', color: colors.text, marginTop: 2, letterSpacing: 0 }}
        >
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Text
            style={{
              fontSize: 12.5,
              fontWeight: '700',
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {price}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onStatus();
            }}
            hitSlop={6}
            style={{
              paddingHorizontal: 8,
              height: 22,
              borderRadius: 999,
              backgroundColor: statusTone,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: statusFg, letterSpacing: 0.3 }}>
              {statusLabel.toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onDelete();
        }}
        hitSlop={6}
        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel="Supprimer"
      >
        <Trash2 size={16} color={colors.danger} strokeWidth={2} />
      </Pressable>
    </Pressable>
  );
}

// =================================================================
// Estate (Real-estate agent) dashboard
// =================================================================

export function EstateDashboard() {
  const myProperties = useMemo(() => mockProperties.slice(0, 4), []);

  return (
    <View>
      <View style={{ paddingHorizontal: 20 }}>
        <RevenueHero
          label="REVENUS LOCATIFS · 30 JOURS"
          value="9,8M"
          unit="GNF"
          subline="6 biens loués · loyer moyen 1,6M GNF"
          trend="+12 %"
        />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <QuickAction
            Icon={CalendarDays}
            label="Visites"
            onPress={() => router.push('/pro/visites')}
            badge="4"
            accent
          />
          <QuickAction
            Icon={MessageSquare}
            label="Demandes"
            onPress={() => router.push('/pro/demandes')}
            badge="7"
            accent
          />
          <QuickAction
            Icon={KeyRound}
            label="Baux"
            onPress={() => router.push('/agent/leases')}
          />
          <QuickAction
            Icon={BarChart3}
            label="Stats"
            onPress={() => router.push('/pro/stats')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <QuickAction
            Icon={Zap}
            label="Booster"
            onPress={() => router.push('/pro/boost')}
          />
          <QuickAction
            Icon={ArrowUpRight}
            label="Versements"
            onPress={() => router.push('/seller/payouts')}
          />
          <QuickAction
            Icon={Star}
            label="Avis"
            onPress={() => {}}
          />
          <QuickAction
            Icon={Building2}
            label="Mes biens"
            onPress={() => {}}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 22, flexDirection: 'row', gap: 10 }}>
        <StatTile Icon={Building2} label="Biens" value="12" sub="3 en attente" />
        <StatTile
          Icon={KeyRound}
          label="Loués"
          value="6"
          sub="Tout occupé"
          subTone="accent"
        />
        <StatTile Icon={Star} label="Note" value="4.8" sub="48 avis" />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <ViewsChart bars={VIEW_BARS} title="VUES · 30 JOURS" value="2 140" trend="+9 %" />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
        <SectionTitle title="Mes biens" />
        <View style={{ gap: 12 }}>
          {myProperties.map((p) => (
            <PropertyRow
              key={p.id}
              title={p.title}
              price={formatGNF(p.priceGnf)}
              perMonth={!!p.perMonth}
              cover={p.photos[0]}
              district={p.district}
              city={p.city}
              bedrooms={p.bedrooms}
              status={p.status}
              type={p.type}
              onPress={() => router.push(`/property/${p.id}`)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// =================================================================
// Shared subcomponents
// =================================================================

function RevenueHero({
  label,
  value,
  unit,
  subline,
  trend,
}: {
  label: string;
  value: string;
  unit: string;
  subline: string;
  trend: string;
}) {
  return (
    <Pressable>
      <View
        style={{
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: '#0A5240',
        }}
      >
        <LinearGradient
          colors={['#118866', '#0A5240', '#063929']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={['rgba(232,165,61,0.35)', 'rgba(232,165,61,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.6 }}
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: 999,
          }}
        />
        <LinearGradient
          colors={['rgba(120,220,180,0.18)', 'rgba(120,220,180,0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0.6, y: 0.4 }}
          style={{
            position: 'absolute',
            bottom: -50,
            left: -30,
            width: 220,
            height: 220,
            borderRadius: 999,
          }}
        />
        <NoiseOverlay />

        <View style={{ padding: 20 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: 0.6,
              }}
            >
              {label}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.18)',
              }}
            >
              <TrendingUp size={11} color="#FFFFFF" strokeWidth={2.25} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{trend}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <Text
              style={{
                fontSize: 38,
                fontWeight: '700',
                color: '#FFFFFF',
                lineHeight: 44,
                letterSpacing: -0.8,
                includeFontPadding: false,
                fontVariant: ['tabular-nums'],
              }}
            >
              {value}
            </Text>
            <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
              {unit}
            </Text>
          </View>
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {subline}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              gap: 3,
              height: 32,
              alignItems: 'flex-end',
              marginTop: 18,
            }}
          >
            {VIEW_BARS.slice(0, 24).map((h, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  backgroundColor:
                    i > 18 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)',
                  borderRadius: 2,
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function QuickAction({
  Icon,
  label,
  onPress,
  badge,
  accent,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  badge?: string;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={{ flex: 1, alignItems: 'center', gap: 8 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={colors.text} strokeWidth={1.75} />
        {badge && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              paddingHorizontal: 5,
              borderRadius: 999,
              backgroundColor: accent ? colors.accent : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.bg,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: '700',
                lineHeight: 12,
                includeFontPadding: false,
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text, letterSpacing: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatTile({
  Icon,
  label,
  value,
  sub,
  subTone,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  subTone?: 'accent';
}) {
  const { colors } = useTheme();
  const subColor = subTone === 'accent' ? colors.accent : colors.textMuted;
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon size={16} color={colors.textMuted} strokeWidth={1.75} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.textFaint,
          letterSpacing: 0.5,
          marginTop: 10,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -0.3,
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: subColor,
          marginTop: 4,
          letterSpacing: 0,
          lineHeight: 14,
          includeFontPadding: false,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}

function ViewsChart({
  bars,
  title,
  value,
  trend,
}: {
  bars: number[];
  title: string;
  value: string;
  trend: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingTop: 20,
        paddingBottom: 18,
        borderRadius: 20,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.textFaint,
          letterSpacing: 0.5,
          lineHeight: 14,
          includeFontPadding: false,
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '700',
            color: colors.text,
            letterSpacing: -0.5,
            lineHeight: 30,
            includeFontPadding: false,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 8,
            height: 22,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
          }}
        >
          <ArrowUpRight size={11} color={colors.primaryDeep} strokeWidth={2.5} />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.primaryDeep,
              lineHeight: 13,
              includeFontPadding: false,
            }}
          >
            {trend}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 3,
          height: 56,
          alignItems: 'flex-end',
          marginTop: 18,
        }}
      >
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              backgroundColor: i > 22 ? colors.primary : colors.primarySoft,
              borderRadius: 3,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Pressable>
        <Text
          style={{ fontSize: 13, fontWeight: '600', color: colors.primary, letterSpacing: 0 }}
        >
          Tout voir
        </Text>
      </Pressable>
    </View>
  );
}

function ProductRow({
  title,
  price,
  cover,
  views,
  favs,
  boosted,
  onPress,
}: {
  title: string;
  price: string;
  cover: string;
  views: number;
  favs: number;
  boosted?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Image
        source={cover}
        style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: colors.bgSunken }}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14.5, fontWeight: '600', color: colors.text, letterSpacing: 0 }}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: colors.text,
            marginTop: 4,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0,
          }}
        >
          {price}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Eye size={12} color={colors.textMuted} strokeWidth={1.75} />
            <Text
              style={{
                fontSize: 11.5,
                color: colors.textMuted,
                fontVariant: ['tabular-nums'],
                letterSpacing: 0,
              }}
            >
              {views}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Heart size={12} color={colors.textMuted} strokeWidth={1.75} />
            <Text
              style={{
                fontSize: 11.5,
                color: colors.textMuted,
                fontVariant: ['tabular-nums'],
                letterSpacing: 0,
              }}
            >
              {favs}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: boosted ? colors.accentSoft : colors.primarySoft,
            }}
          >
            {boosted && <SparklesIcon size={10} color={colors.accentText} strokeWidth={2.25} />}
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: boosted ? colors.accentText : colors.primaryDeep,
                letterSpacing: 0.3,
              }}
            >
              {boosted ? 'BOOSTÉE' : 'ACTIVE'}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        hitSlop={6}
        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreVertical size={16} color={colors.textMuted} strokeWidth={1.75} />
      </Pressable>
    </Pressable>
  );
}

function PropertyRow({
  title,
  price,
  perMonth,
  cover,
  district,
  city,
  bedrooms,
  status,
  type,
  onPress,
}: {
  title: string;
  price: string;
  perMonth: boolean;
  cover: string;
  district: string;
  city: string;
  bedrooms?: number;
  status: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
  type: 'location' | 'vente' | 'terrain';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const typeLabel = type === 'location' ? 'LOCATION' : type === 'vente' ? 'VENTE' : 'TERRAIN';
  const inactive = status === 'reserved' || status === 'sold' || status === 'paused';
  const statusLabel =
    status === 'reserved'
      ? 'LOUÉ'
      : status === 'sold'
        ? 'VENDU'
        : status === 'paused'
          ? 'EN PAUSE'
          : status === 'pending'
            ? 'EN ATTENTE'
            : 'ACTIF';
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Image
        source={cover}
        style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: colors.bgSunken }}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.5,
          }}
        >
          {typeLabel}
        </Text>
        <Text
          style={{
            fontSize: 14.5,
            fontWeight: '600',
            color: colors.text,
            marginTop: 1,
            letterSpacing: 0,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 3 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: colors.text,
              fontVariant: ['tabular-nums'],
              letterSpacing: 0,
            }}
          >
            {price}
          </Text>
          {perMonth && (
            <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0 }}>/mois</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
            <Text
              style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }}
              numberOfLines={1}
            >
              {district}, {city}
            </Text>
          </View>
          {typeof bedrooms === 'number' && bedrooms > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <BedDouble size={11} color={colors.textMuted} strokeWidth={2} />
              <Text
                style={{
                  fontSize: 11.5,
                  color: colors.textMuted,
                  fontVariant: ['tabular-nums'],
                  letterSpacing: 0,
                }}
              >
                {bedrooms}
              </Text>
            </View>
          )}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: inactive ? colors.accentSoft : colors.primarySoft,
            }}
          >
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: inactive ? colors.accentText : colors.primaryDeep,
                letterSpacing: 0.3,
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        hitSlop={6}
        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreVertical size={16} color={colors.textMuted} strokeWidth={1.75} />
      </Pressable>
    </Pressable>
  );
}
