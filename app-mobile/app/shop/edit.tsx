// Seller "Modifier ma boutique" screen. The boutique auto-creates "Ma boutique"
// on first publish but had no edit surface — the IdentityPill was a dead control
// once a shop existed. Wires shop name / city / about / logo / cover to the
// existing useUpsertShop (shop-upsert) endpoint. Images go through the same
// signed-upload flow as the profile avatar (avatars bucket; shop-upsert accepts
// any of our storage URLs).
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, Camera, ImagePlus, Store } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Switch } from '../../src/components/primitives/Switch';
import { Chip } from '../../src/components/primitives/Chip';
import { WEEK_ORDER, DAY_LABELS_FR } from '../../src/lib/shopHours';
import { TopBar } from '../../src/components/nav/TopBar';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../src/components/forms/CitySelectField';
import { LocationMapPicker } from '../../src/components/location/LocationMapPicker';
import { I } from '../../src/icons/Icon';
import { useMyShop, useUpsertShop } from '../../src/data/queries';
import { useUploadAvatar } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';

type ImgMime = 'image/jpeg' | 'image/png' | 'image/webp';
function resolveMime(asset: ImagePicker.ImagePickerAsset): ImgMime {
  const m = asset.mimeType?.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return m;
  const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export default function ShopEditRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // Which profile is being edited — boutique or agence immo (client 2026-08-07).
  // They are separate rows with their own branding, so the caller says which one;
  // omitted => boutique, which is what every pre-split entry point meant.
  const params = useLocalSearchParams<{ kind?: string }>();
  const profileKind: 'shop' | 'agency' = params.kind === 'agency' ? 'agency' : 'shop';
  const isAgency = profileKind === 'agency';
  const shopsQuery = useMyShop(profileKind);
  const upsert = useUpsertShop();
  const uploadLogo = useUploadAvatar();
  const uploadCover = useUploadAvatar();

  const shop = shopsQuery.data;

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [about, setAbout] = useState('');
  const [avatar, setAvatar] = useState('');
  const [cover, setCover] = useState('');
  // Exact shop point — picked on the map, pre-filled from the saved shop. We only
  // SEND coords when they actually changed (see `dirty` below); shop-upsert
  // preserves the existing pin when lat/lng is omitted from the payload.
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  // Opening hours. hoursEnabled off => no schedule (opening_hours null). Defaults
  // are sensible starting points the owner can adjust once they enable the section.
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('20:00');
  const [hydrated, setHydrated] = useState(false);

  // Prefill once the shop loads (useState can't read async data at init).
  if (shop && !hydrated) {
    setName(shop.name ?? '');
    setCity(shop.city ?? '');
    setAbout(shop.about ?? '');
    setAvatar(shop.avatar ?? '');
    setCover(shop.cover ?? '');
    setLat(shop.lat ?? null);
    setLng(shop.lng ?? null);
    if (shop.openingHours) {
      setHoursEnabled(true);
      setAlwaysOpen(shop.openingHours.alwaysOpen);
      if (!shop.openingHours.alwaysOpen) {
        if (shop.openingHours.days.length) setDays(shop.openingHours.days);
        if (shop.openingHours.open) setOpenTime(shop.openingHours.open);
        if (shop.openingHours.close) setCloseTime(shop.openingHours.close);
      }
    }
    setHydrated(true);
  }

  // Same screen serves both profiles; the agence variant only swaps wording
  // (« Ma boutique » → « Mon agence », etc.). Keys without an agency override
  // fall through to the shared boutique string.
  const tk = (key: string) =>
    isAgency ? t(`shopEdit.agency${key[0].toUpperCase()}${key.slice(1)}`, { defaultValue: t(`shopEdit.${key}`) }) : t(`shopEdit.${key}`);

  const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const sanitizeTime = (txt: string) => txt.replace(/[^\d:]/g, '').slice(0, 5);

  // Build the wire payload (or null) + a stable serialization for dirty checks.
  const hoursPayload = !hoursEnabled
    ? null
    : {
        always_open: alwaysOpen,
        days: alwaysOpen ? [] : WEEK_ORDER.filter((d) => days.includes(d)),
        open: alwaysOpen ? '00:00' : openTime,
        close: alwaysOpen ? '00:00' : closeTime,
      };
  const originalHours = shop?.openingHours
    ? {
        always_open: shop.openingHours.alwaysOpen,
        days: shop.openingHours.alwaysOpen ? [] : WEEK_ORDER.filter((d) => shop.openingHours!.days.includes(d)),
        open: shop.openingHours.alwaysOpen ? '00:00' : shop.openingHours.open,
        close: shop.openingHours.alwaysOpen ? '00:00' : shop.openingHours.close,
      }
    : null;
  const hoursDirty = JSON.stringify(hoursPayload) !== JSON.stringify(originalHours);
  // A configured (non-24h) schedule needs at least one day and valid HH:MM times.
  const hoursValid = !hoursEnabled || alwaysOpen || (days.length > 0 && HM_RE.test(openTime) && HM_RE.test(closeTime));

  const busy = uploadLogo.isPending || uploadCover.isPending;
  const dirty =
    hydrated &&
    (name.trim() !== (shop?.name ?? '') ||
      city.trim() !== (shop?.city ?? '') ||
      about.trim() !== (shop?.about ?? '') ||
      avatar !== (shop?.avatar ?? '') ||
      cover !== (shop?.cover ?? '') ||
      hoursDirty ||
      lat !== (shop?.lat ?? null) ||
      lng !== (shop?.lng ?? null));
  const canSave = dirty && !!name.trim() && name.trim().length >= 2 && !!city.trim() && !busy && hoursValid;
  // Non-blocking nudge only (client decision 2026-09-05): a seller who moved
  // the pin THIS session is trusted as pinned immediately ; otherwise fall
  // back to the server's geo_is_pinned verdict on the saved point.
  const pinChanged = lat !== (shop?.lat ?? null) || lng !== (shop?.lng ?? null);
  const isPinned = pinChanged ? lat != null && lng != null : !!shop?.pinned;

  async function pick(kind: 'logo' | 'cover') {
    const m = kind === 'logo' ? uploadLogo : uploadCover;
    if (m.isPending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show(t('shopEdit.photoPermission'), 'danger');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 9],
      quality: 0.9,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0];
    try {
      const url = await m.mutateAsync({ uri: asset.uri, mime: resolveMime(asset) });
      if (kind === 'logo') setAvatar(url);
      else setCover(url);
    } catch (e) {
      toast.show(toToastMessage(e, t('shopEdit.uploadError')), 'danger');
    }
  }

  async function onSave() {
    if (!canSave || upsert.isPending || !shop) return;
    try {
      await upsert.mutateAsync({
        id: shop.id,
        name: name.trim(),
        city: city.trim(),
        about: about.trim(),
        avatar_url: avatar || null,
        cover_url: cover || null,
        opening_hours: hoursPayload,
        ...(lat !== (shop.lat ?? null) || lng !== (shop.lng ?? null) ? { lat, lng } : {}),
      });
      toast.show(tk('successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, tk('errorToast')), 'danger');
    }
  }

  if (shopsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={tk('topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={150} radius={16} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={56} radius={12} />
        </View>
      </SafeAreaView>
    );
  }
  if (shopsQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={tk('topbar')} back />
        <ErrorStateView onRetry={() => void shopsQuery.refetch()} />
      </SafeAreaView>
    );
  }
  if (!shop) {
    // No shop yet — the create flow scaffolds one on first publish.
    router.replace('/create');
    return null;
  }

  const label = (txt: string) => (
    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginTop: 18, marginBottom: 8 }}>
      {txt}
    </Text>
  );
  const inputStyle = {
    height: 56,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '500' as const,
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={tk('topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          {/* Cover + logo */}
          <View style={{ marginTop: 12 }}>
            <Pressable onPress={() => pick('cover')} disabled={uploadCover.isPending} style={{ borderRadius: 16, overflow: 'hidden' }}>
              <View style={{ aspectRatio: 16 / 9, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
                {cover ? (
                  <Image source={cover} contentFit="cover" style={{ width: '100%', height: '100%' }} transition={120} />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <ImagePlus size={26} color={colors.textMuted} strokeWidth={1.75} />
                    <Text variant="caption" tone="muted">{t('shopEdit.addCover')}</Text>
                  </View>
                )}
                {uploadCover.isPending && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
              </View>
            </Pressable>

            {/* Logo overlaps the cover bottom-left */}
            <Pressable
              onPress={() => pick('logo')}
              disabled={uploadLogo.isPending}
              style={{ width: 76, height: 76, marginTop: -38, marginLeft: 12 }}
              accessibilityLabel={tk('changeLogoA11y')}
            >
              {avatar ? (
                <Image source={avatar} contentFit="cover" style={{ width: 76, height: 76, borderRadius: 18, borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.bgSunken }} transition={120} />
              ) : (
                <View style={{ width: 76, height: 76, borderRadius: 18, borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
                  {isAgency
                    ? <Building2 size={26} color={colors.textMuted} strokeWidth={1.75} />
                    : <Store size={26} color={colors.textMuted} strokeWidth={1.75} />}
                </View>
              )}
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg }}>
                {uploadLogo.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Camera size={13} color="#FFFFFF" strokeWidth={2} />}
              </View>
            </Pressable>
          </View>

          {label(tk('nameLabel'))}
          <TextInput value={name} onChangeText={setName} placeholder={tk('namePlaceholder')} placeholderTextColor={colors.textFaint} maxLength={80} style={inputStyle} />

          {label(t('shopEdit.cityLabel'))}
          <CitySelectField label="" value={city} onChange={setCity} />

          {label(tk('locationLabel'))}
          <Text variant="micro" tone="muted" style={{ marginTop: -4, marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>
            {tk('locationHelp')}
          </Text>
          <LocationMapPicker
            lat={lat}
            lng={lng}
            onChange={(la, lo) => {
              setLat(la);
              setLng(lo);
            }}
            testID="shop-location-picker"
          />
          {!isPinned && (
            <View
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 12,
                backgroundColor: colors.bgSunken,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <I.pin size={14} color={colors.textMuted} />
              <Text variant="micro" tone="muted" style={{ flex: 1, textTransform: 'none', letterSpacing: 0 }}>
                {tk('locationBannerNotPinned')}
              </Text>
            </View>
          )}

          {label(t('shopEdit.aboutLabel'))}
          <TextInput
            value={about}
            onChangeText={(txt) => setAbout(txt.slice(0, 800))}
            placeholder={tk('aboutPlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            style={{ ...inputStyle, height: 120, paddingTop: 14, textAlignVertical: 'top' }}
          />
          <Text variant="micro" tone="faint" style={{ alignSelf: 'flex-end', marginTop: 6, fontVariant: ['tabular-nums'] }}>
            {about.length} / 800
          </Text>

          {/* Opening hours — drives the storefront's dynamic Ouvert/Fermé +
              24/24h badge on the client side. */}
          {label(t('shopEdit.hoursSection'))}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              height: 56,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('shopEdit.hoursEnable')}</Text>
            <Switch value={hoursEnabled} onChange={setHoursEnabled} />
          </View>

          {hoursEnabled && (
            <>
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  height: 56,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('shopEdit.hours24')}</Text>
                <Switch value={alwaysOpen} onChange={setAlwaysOpen} />
              </View>

              {!alwaysOpen && (
                <>
                  <Text variant="micro" tone="muted" style={{ marginTop: 14, marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>
                    {t('shopEdit.hoursDays')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {WEEK_ORDER.map((d) => (
                      <Chip key={d} label={DAY_LABELS_FR[d]} active={days.includes(d)} onPress={() => toggleDay(d)} />
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="micro" tone="muted" style={{ marginBottom: 6, textTransform: 'none', letterSpacing: 0 }}>
                        {t('shopEdit.hoursOpen')}
                      </Text>
                      <TextInput
                        value={openTime}
                        onChangeText={(txt) => setOpenTime(sanitizeTime(txt))}
                        placeholder="08:00"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={inputStyle}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="micro" tone="muted" style={{ marginBottom: 6, textTransform: 'none', letterSpacing: 0 }}>
                        {t('shopEdit.hoursClose')}
                      </Text>
                      <TextInput
                        value={closeTime}
                        onChangeText={(txt) => setCloseTime(sanitizeTime(txt))}
                        placeholder="20:00"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={inputStyle}
                      />
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Footer sits outside the top-only SafeAreaView, so pad by the real bottom
            inset or the action hides behind the Android nav bar (client 2026-08-05). */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Button variant="dark" size="lg" block label={t('shopEdit.save')} onPress={onSave} loading={upsert.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
