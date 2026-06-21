import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Edit2, Home, MapPin, Plus, Star, Trash2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Switch } from '../../src/components/primitives/Switch';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { CitySelectField } from '../../src/components/forms/CitySelectField';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import {
  useMyAddresses,
  useAddAddress,
  useUpdateAddress,
  useRemoveAddress,
  useSetDefaultAddress,
  type UserAddress,
} from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';

// Pre-prod: real address-book CRUD. Replaces the X.7 "Bientot" placeholder.
// Addresses are not an auth surface (unlike phones), so no OTP step ; the
// server enforces the curated Guinea city allowlist + the partial-unique
// default index via set_default_address. See queries/addresses.ts +
// supabase/functions/address-* for the security + concurrency rationale.

interface SheetState {
  open: boolean;
  edit: UserAddress | null;
}

export default function AddressesRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const query = useMyAddresses();
  const removeAddress = useRemoveAddress();
  const setDefault = useSetDefaultAddress();

  const [sheet, setSheet] = useState<SheetState>({ open: false, edit: null });

  const addresses = query.data ?? [];

  const onPressRemove = (a: UserAddress) => {
    Alert.alert(
      t('settings.addresses.removeTitle'),
      t('settings.addresses.removeBody', { label: a.label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.addresses.removeConfirm'),
          style: 'destructive',
          onPress: () => {
            removeAddress.mutate(
              { addressId: a.id },
              {
                onSuccess: () => toast.show(t('settings.addresses.removeOk'), 'success'),
                onError: (e) => toast.show(toToastMessage(e, t('settings.addresses.removeError')), 'danger'),
              },
            );
          },
        },
      ],
    );
  };

  const onPressSetDefault = (a: UserAddress) => {
    if (a.is_default) return;
    haptic.light();
    setDefault.mutate(
      { addressId: a.id },
      {
        onSuccess: () => toast.show(t('settings.addresses.defaultOk'), 'success'),
        onError: (e) => toast.show(toToastMessage(e, t('settings.addresses.defaultError')), 'danger'),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('settings.addresses.title')}
          subtitle={t('settings.addresses.subtitle')}
        />

        <View style={{ paddingHorizontal: 24 }}>
          {query.isLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={86} radius={16} />
              <Skeleton height={86} radius={16} />
            </View>
          ) : query.isError ? (
            <View style={{ minHeight: 240 }}>
              <ErrorStateView onRetry={() => query.refetch()} />
            </View>
          ) : addresses.length === 0 ? (
            <View
              style={{
                paddingVertical: 30,
                alignItems: 'center',
                gap: 8,
                borderRadius: 18,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MapPin size={20} color={colors.textMuted} strokeWidth={1.75} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                {t('settings.addresses.emptyTitle')}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  textAlign: 'center',
                  maxWidth: 260,
                  lineHeight: 17,
                }}
              >
                {t('settings.addresses.emptyBody')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {addresses.map((a) => (
                <AddressCard
                  key={a.id}
                  address={a}
                  busy={removeAddress.isPending || setDefault.isPending}
                  onSetDefault={() => onPressSetDefault(a)}
                  onEdit={() => setSheet({ open: true, edit: a })}
                  onRemove={() => onPressRemove(a)}
                />
              ))}
            </View>
          )}

          <View style={{ marginTop: 18 }}>
            <Button
              variant="dark"
              size="lg"
              block
              leading={<Plus size={16} color={colors.bg} strokeWidth={2.25} />}
              label={t('settings.addresses.addCta')}
              onPress={() => {
                haptic.light();
                setSheet({ open: true, edit: null });
              }}
            />
          </View>

          <View
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Home size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.textMuted,
                letterSpacing: 0,
              }}
            >
              {t('settings.addresses.note')}
            </Text>
          </View>
        </View>
      </ScrollView>

      <AddressSheet
        state={sheet}
        onClose={() => setSheet({ open: false, edit: null })}
        hasAny={addresses.length > 0}
      />
    </SafeAreaView>
  );
}

function AddressCard({
  address,
  busy,
  onSetDefault,
  onEdit,
  onRemove,
}: {
  address: UserAddress;
  busy: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sub = [address.city, address.district, address.details].filter(Boolean).join(' · ');
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: address.is_default ? colors.primary : colors.border,
        backgroundColor: colors.card,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MapPin size={16} color={colors.text} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
              {address.label}
            </Text>
            {address.is_default && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Star size={9} color={colors.primaryDeep} fill={colors.primaryDeep} strokeWidth={2} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.3 }}>
                  {t('settings.addresses.defaultBadge')}
                </Text>
              </View>
            )}
          </View>
          {sub.length > 0 && (
            <Text
              style={{
                marginTop: 4,
                fontSize: 12.5,
                color: colors.textMuted,
                lineHeight: 17,
              }}
            >
              {sub}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {!address.is_default && (
          <Pressable
            onPress={onSetDefault}
            disabled={busy}
            style={{
              flex: 1,
              minWidth: 120,
              height: 36,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text }}>
              {t('settings.addresses.setDefault')}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onEdit}
          disabled={busy}
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Edit2 size={13} color={colors.text} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text }}>
            {t('settings.addresses.edit')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onRemove}
          disabled={busy}
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: 'rgba(209,79,60,0.3)',
            backgroundColor: 'rgba(209,79,60,0.06)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Trash2 size={13} color={colors.danger} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.danger }}>
            {t('settings.addresses.remove')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddressSheet({
  state,
  onClose,
  hasAny,
}: {
  state: SheetState;
  onClose: () => void;
  hasAny: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const addAddress = useAddAddress();
  const updateAddress = useUpdateAddress();

  const editing = state.edit;
  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [details, setDetails] = useState('');
  // The "default" toggle is only meaningful when adding (an edit can't flip
  // is_default — that's gated to the dedicated set-default path so the
  // partial-unique index can't race a label edit). Hidden in edit mode.
  const [isDefault, setIsDefault] = useState(false);

  // Reset state every time the sheet opens — otherwise a previous edit leaks
  // into the next add attempt.
  useEffect(() => {
    if (state.open) {
      setLabel(editing?.label ?? '');
      setCity(editing?.city ?? '');
      setDistrict(editing?.district ?? '');
      setDetails(editing?.details ?? '');
      // Default add UX: first-ever address gets auto-defaulted server-side
      // anyway, but pre-checking the toggle when there's nothing else makes
      // that visible to the user.
      setIsDefault(editing ? editing.is_default : !hasAny);
    }
  }, [state.open, editing, hasAny]);

  const trimmedLabel = label.trim();
  const labelValid = trimmedLabel.length > 0 && trimmedLabel.length <= 60;
  const cityValid = city.trim().length > 0;
  const canSave = labelValid && cityValid && !addAddress.isPending && !updateAddress.isPending;

  if (!state.open) return null;

  const onSave = () => {
    if (!labelValid) {
      toast.show(t('settings.addresses.invalidLabel'), 'danger');
      return;
    }
    if (!cityValid) {
      toast.show(t('settings.addresses.invalidCity'), 'danger');
      return;
    }
    if (editing) {
      updateAddress.mutate(
        {
          address_id: editing.id,
          label: trimmedLabel,
          city: city.trim(),
          district: district.trim() || null,
          details: details.trim() || null,
        },
        {
          onSuccess: () => {
            toast.show(t('settings.addresses.updateOk'), 'success');
            onClose();
          },
          onError: (e) => toast.show(toToastMessage(e, t('settings.addresses.updateError')), 'danger'),
        },
      );
    } else {
      addAddress.mutate(
        {
          label: trimmedLabel,
          city: city.trim(),
          district: district.trim() || null,
          details: details.trim() || null,
          is_default: isDefault,
        },
        {
          onSuccess: () => {
            toast.show(t('settings.addresses.addOk'), 'success');
            onClose();
          },
          onError: (e) => toast.show(toToastMessage(e, t('settings.addresses.addError')), 'danger'),
        },
      );
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
      }}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 32,
            gap: 14,
            maxHeight: '92%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
              {editing ? t('settings.addresses.editSheetTitle') : t('settings.addresses.addSheetTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14, paddingBottom: 4 }}
          >
            <FieldLabel text={t('settings.addresses.labelLabel')} />
            <TextInput
              value={label}
              onChangeText={(v) => setLabel(v.slice(0, 60))}
              placeholder={t('settings.addresses.labelPlaceholder')}
              placeholderTextColor={colors.textFaint}
              style={inputStyle(colors)}
            />

            <CitySelectField label={t('settings.addresses.cityLabel')} value={city} onChange={setCity} />

            <FieldLabel text={t('settings.addresses.districtLabel')} />
            <TextInput
              value={district}
              onChangeText={(v) => setDistrict(v.slice(0, 80))}
              placeholder={t('settings.addresses.districtPlaceholder')}
              placeholderTextColor={colors.textFaint}
              style={inputStyle(colors)}
            />

            <FieldLabel text={t('settings.addresses.detailsLabel')} />
            <TextInput
              value={details}
              onChangeText={(v) => setDetails(v.slice(0, 200))}
              placeholder={t('settings.addresses.detailsPlaceholder')}
              placeholderTextColor={colors.textFaint}
              multiline
              style={[inputStyle(colors), { minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }]}
            />

            {!editing && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ flex: 1, fontSize: 13.5, color: colors.text, marginRight: 12 }}>
                  {t('settings.addresses.setDefaultToggle')}
                </Text>
                <Switch value={isDefault} onChange={setIsDefault} />
              </View>
            )}
          </ScrollView>

          <Button
            variant="dark"
            size="lg"
            block
            label={t('settings.addresses.save')}
            disabled={!canSave}
            loading={addAddress.isPending || updateAddress.isPending}
            onPress={onSave}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: -8,
        letterSpacing: 0.2,
      }}
    >
      {text}
    </Text>
  );
}

function inputStyle(colors: ReturnType<typeof useTheme>['colors']) {
  return {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bgElev,
  } as const;
}
