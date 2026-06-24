import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, MapPin, User, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { useAvailableLivreurs } from '../../data/queries';
import type { AvailableLivreur, VehicleType } from '../../data/types';

const VEHICLE_KEYS: Record<VehicleType, string> = {
  moto: 'seller.livreurVehicle.moto',
  voiture: 'seller.livreurVehicle.voiture',
  velo: 'seller.livreurVehicle.velo',
  a_pied: 'seller.livreurVehicle.a_pied',
};

// Bottom-sheet courier picker for the seller order screen. Self-contained
// Modal (mirrors CitySelectField) so it works without a bottom-sheet provider
// in the tree. Fetches the available pool only while open (enabled = open),
// prioritized by the order's delivery city. Select a row → Confirm → onConfirm;
// the parent owns the assign mutation and closes the sheet on success.
export function LivreurPickerSheet({
  open,
  onClose,
  city,
  assigning,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  city: string | null;
  assigning: boolean;
  onConfirm: (livreur: AvailableLivreur) => void;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: livreurs, isLoading, isError, refetch, isRefetching } = useAvailableLivreurs(city, open);

  // Reset the selection each time the sheet opens so a prior pick doesn't
  // linger into a fresh (or reassign) session.
  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  const selected = livreurs?.find((l) => l.id === selectedId) ?? null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '80%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
        }}
      >
        <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 4,
            }}
          >
            <Text variant="titleM" style={{ fontSize: 16 }}>
              {t('seller.livreurPickerTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel={t('common.city.a11yClose')}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={colors.text} strokeWidth={2.25} />
            </Pressable>
          </View>
          <Text tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 8, fontSize: 12.5, letterSpacing: 0, textTransform: 'none' }}>
            {t('seller.livreurPickerSubtitle')}
          </Text>

          {/* Body */}
          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator color={colors.primary} />
              <Text tone="muted" style={{ fontSize: 13 }}>
                {t('seller.livreurPickerLoading')}
              </Text>
            </View>
          ) : isError ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
              <Text style={{ fontSize: 14, color: colors.text, textAlign: 'center' }}>
                {t('seller.livreurPickerError')}
              </Text>
              <Pressable
                onPress={() => void refetch()}
                style={{
                  paddingHorizontal: 20,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {isRefetching && <ActivityIndicator size="small" color={colors.text} />}
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  {t('seller.livreurPickerRetry')}
                </Text>
              </Pressable>
            </View>
          ) : !livreurs || livreurs.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
              <User size={28} color={colors.textFaint} strokeWidth={1.75} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' }}>
                {t('seller.livreurPickerEmptyTitle')}
              </Text>
              <Text tone="muted" style={{ fontSize: 12.5, textAlign: 'center', letterSpacing: 0, textTransform: 'none' }}>
                {t('seller.livreurPickerEmptyBody')}
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            >
              {livreurs.map((l) => (
                <LivreurRow
                  key={l.id}
                  livreur={l}
                  selected={l.id === selectedId}
                  disabled={assigning}
                  onPress={() => {
                    haptic.selection();
                    setSelectedId(l.id);
                  }}
                />
              ))}
            </ScrollView>
          )}

          {/* Confirm CTA — only when there's a pickable list */}
          {!isLoading && !isError && livreurs && livreurs.length > 0 && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.bg,
              }}
            >
              <Pressable
                disabled={!selected || assigning}
                onPress={() => {
                  if (!selected || assigning) return;
                  haptic.medium();
                  onConfirm(selected);
                }}
                style={{
                  height: 54,
                  borderRadius: radii.md,
                  backgroundColor: selected && !assigning ? colors.text : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  opacity: selected && !assigning ? 1 : 0.6,
                }}
              >
                {assigning && <ActivityIndicator size="small" color={colors.bg} />}
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: selected && !assigning ? colors.bg : colors.textFaint,
                  }}
                >
                  {assigning ? t('seller.livreurPickerAssigning') : t('seller.livreurPickerConfirm')}
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function LivreurRow({
  livreur,
  selected,
  disabled,
  onPress,
}: {
  livreur: AvailableLivreur;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const vehicleLabel = livreur.vehicleType ? t(VEHICLE_KEYS[livreur.vehicleType]) : null;
  const countLabel =
    livreur.activeDeliveries === 0
      ? t('seller.livreurAvailable')
      : t('seller.livreurPickerActiveCount', { count: livreur.activeDeliveries });
  // ville · moyen de transport on the sub line.
  const subParts = [livreur.city, vehicleLabel].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        marginTop: 10,
        borderRadius: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.card,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: selected ? colors.bg : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <User size={18} color={selected ? colors.primary : colors.textMuted} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.text, letterSpacing: 0 }} numberOfLines={1}>
          {livreur.name ?? '—'}
        </Text>
        {subParts.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0 }} numberOfLines={1}>
              {subParts.join(' · ')}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2, letterSpacing: 0 }}>
          {countLabel}
        </Text>
      </View>
      {selected && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
    </Pressable>
  );
}
