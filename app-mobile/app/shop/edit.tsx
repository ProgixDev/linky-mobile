// Seller "Modifier ma boutique" screen. The boutique auto-creates "Ma boutique"
// on first publish but had no edit surface — the IdentityPill was a dead control
// once a shop existed. Wires shop name / city / about / logo / cover to the
// existing useUpsertShop (shop-upsert) endpoint. Images go through the same
// signed-upload flow as the profile avatar (avatars bucket; shop-upsert accepts
// any of our storage URLs).
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, ImagePlus, Store } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../src/components/forms/CitySelectField';
import { LocationMapPicker } from '../../src/components/location/LocationMapPicker';
import { useMyShops, useUpsertShop } from '../../src/data/queries';
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
  const toast = useToast();
  const shopsQuery = useMyShops();
  const upsert = useUpsertShop();
  const uploadLogo = useUploadAvatar();
  const uploadCover = useUploadAvatar();

  const shop = shopsQuery.data?.[0];

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [about, setAbout] = useState('');
  const [avatar, setAvatar] = useState('');
  const [cover, setCover] = useState('');
  // Exact shop point — picked on the map. The shop list view doesn't return lat/lng,
  // so we can't pre-fill the saved pin; we only SEND coords when the seller actually
  // picks one (shop-upsert preserves the existing pin when lat/lng is omitted).
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Prefill once the shop loads (useState can't read async data at init).
  if (shop && !hydrated) {
    setName(shop.name ?? '');
    setCity(shop.city ?? '');
    setAbout(shop.about ?? '');
    setAvatar(shop.avatar ?? '');
    setCover(shop.cover ?? '');
    setHydrated(true);
  }

  const busy = uploadLogo.isPending || uploadCover.isPending;
  const dirty =
    hydrated &&
    (name.trim() !== (shop?.name ?? '') ||
      city.trim() !== (shop?.city ?? '') ||
      about.trim() !== (shop?.about ?? '') ||
      avatar !== (shop?.avatar ?? '') ||
      cover !== (shop?.cover ?? '') ||
      (lat != null && lng != null));
  const canSave = dirty && !!name.trim() && name.trim().length >= 2 && !!city.trim() && !busy;

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
        ...(lat != null && lng != null ? { lat, lng } : {}),
      });
      toast.show(t('shopEdit.successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, t('shopEdit.errorToast')), 'danger');
    }
  }

  if (shopsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('shopEdit.topbar')} back />
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
        <TopBar title={t('shopEdit.topbar')} back />
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
      <TopBar title={t('shopEdit.topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              accessibilityLabel={t('shopEdit.changeLogoA11y')}
            >
              {avatar ? (
                <Image source={avatar} contentFit="cover" style={{ width: 76, height: 76, borderRadius: 18, borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.bgSunken }} transition={120} />
              ) : (
                <View style={{ width: 76, height: 76, borderRadius: 18, borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={26} color={colors.textMuted} strokeWidth={1.75} />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg }}>
                {uploadLogo.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Camera size={13} color="#FFFFFF" strokeWidth={2} />}
              </View>
            </Pressable>
          </View>

          {label(t('shopEdit.nameLabel'))}
          <TextInput value={name} onChangeText={setName} placeholder={t('shopEdit.namePlaceholder')} placeholderTextColor={colors.textFaint} maxLength={80} style={inputStyle} />

          {label(t('shopEdit.cityLabel'))}
          <CitySelectField label="" value={city} onChange={setCity} />

          {label('LOCALISATION EXACTE')}
          <Text variant="micro" tone="muted" style={{ marginTop: -4, marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>
            Place le point exact de ta boutique sur la carte (sinon, le centre de ta ville est utilisé).
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

          {label(t('shopEdit.aboutLabel'))}
          <TextInput
            value={about}
            onChangeText={(txt) => setAbout(txt.slice(0, 800))}
            placeholder={t('shopEdit.aboutPlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
            style={{ ...inputStyle, height: 120, paddingTop: 14, textAlignVertical: 'top' }}
          />
          <Text variant="micro" tone="faint" style={{ alignSelf: 'flex-end', marginTop: 6, fontVariant: ['tabular-nums'] }}>
            {about.length} / 800
          </Text>
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <Button variant="dark" size="lg" block label={t('shopEdit.save')} onPress={onSave} loading={upsert.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
