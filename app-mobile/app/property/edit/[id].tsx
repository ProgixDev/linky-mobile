// Agent edits an existing property. Reachable from the property detail page's
// "Modifier" CTA and the boutique/estate dashboard manage sheet. Covers the
// create-details fields + an editable description AND photos in place (client
// 2026-07-22 — previously photos could only be changed by deleting + recreating
// the listing). Wired to useUpdateProperty -> /property-update, which replaces
// photos atomically via replace_property_photos.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Film, Plus, Rocket, Star, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Switch } from '../../../src/components/primitives/Switch';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { useProperty, useUpdateProperty } from '../../../src/data/queries';
import { useRequestPhotoUploadUrl } from '../../../src/data/queries/products';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { optimizePhoto } from '../../../src/lib/photoOptimize';

type PType = 'location' | 'vente' | 'terrain';
// Phase I.3j — stable backend ids ; the visible label is resolved at render
// time via t() so the chip strip flips with the active language.
const PROPERTY_TYPE_DEFS: { id: PType; labelKey: string }[] = [
  { id: 'location', labelKey: 'propertyEdit.typeLocation' },
  { id: 'vente', labelKey: 'propertyEdit.typeVente' },
  { id: 'terrain', labelKey: 'propertyEdit.typeTerrain' },
];

const MAX_PHOTOS = 12;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];
type EditPhoto = { url: string; storage_path: string };

function sanitizeFilename(raw: string | null | undefined, fallbackExt: string): string {
  const base = (raw ?? `photo.${fallbackExt}`).replace(/[^A-Za-z0-9._-]/g, '');
  const trimmed = base.length > 80 ? base.slice(base.length - 80) : base;
  return trimmed || `photo.${fallbackExt}`;
}
function resolveMime(asset: ImagePicker.ImagePickerAsset): AllowedMime {
  const m = asset.mimeType?.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return m;
  const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
function extForMime(m: AllowedMime): string {
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'jpg';
}
// Reconstruct the in-bucket storage_path from a public photo URL
// (…/storage/v1/object/public/property-photos/<path>). property-update needs
// the path, but existing photos arrive as URLs only.
function pathFromUrl(url: string): string {
  const marker = '/property-photos/';
  const i = url.indexOf(marker);
  return i >= 0 ? url.slice(i + marker.length).split('?')[0] : '';
}

export default function PropertyEditRoute() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const PROPERTY_TYPES = useMemo(
    () => PROPERTY_TYPE_DEFS.map((d) => ({ id: d.id, label: t(d.labelKey) })),
    [t],
  );
  const propertyQuery = useProperty(id);
  const update = useUpdateProperty();
  const requestUploadUrl = useRequestPhotoUploadUrl();
  const prop = propertyQuery.data;

  const [type, setType] = useState<PType>('location');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [perMonth, setPerMonth] = useState(true);
  const [price, setPrice] = useState(0);
  const [area, setArea] = useState(0);
  const [rooms, setRooms] = useState(0);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [distance, setDistance] = useState(0);
  const [furnished, setFurnished] = useState(false);
  const [photos, setPhotos] = useState<EditPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (prop && !hydrated) {
    setType(prop.type as PType);
    setTitle(prop.title);
    setDescription(prop.description);
    setPerMonth(prop.perMonth);
    setPrice(prop.priceGnf);
    setArea(prop.areaSqm ?? 0);
    setRooms(prop.bedrooms ?? 0);
    setCity(prop.city);
    setDistrict(prop.district);
    setDistance(prop.distanceToRoadMeters);
    setFurnished(prop.furnished ?? false);
    setPhotos((prop.photos ?? []).map((u) => ({ url: u, storage_path: pathFromUrl(u) })));
    setVideoUrl(prop.videoUrl ?? null);
    setHydrated(true);
  }

  const isTerrain = type === 'terrain';
  const selectType = (tp: PType) => {
    setType(tp);
    if (tp === 'terrain') {
      setRooms(0);
      setFurnished(false);
    }
  };

  const photosDirty =
    hydrated && !!prop &&
    JSON.stringify(photos.map((p) => p.url)) !== JSON.stringify(prop.photos ?? []);
  const videoDirty = hydrated && !!prop && (videoUrl ?? null) !== (prop.videoUrl ?? null);
  const dirty =
    hydrated &&
    !!prop &&
    (type !== prop.type ||
      title.trim() !== prop.title ||
      description.trim() !== prop.description ||
      (type === 'location' && perMonth !== prop.perMonth) ||
      price !== prop.priceGnf ||
      area !== (prop.areaSqm ?? 0) ||
      rooms !== (prop.bedrooms ?? 0) ||
      city.trim() !== prop.city ||
      district.trim() !== prop.district ||
      distance !== prop.distanceToRoadMeters ||
      furnished !== (prop.furnished ?? false) ||
      photosDirty ||
      videoDirty);
  const canSave = dirty && !!title.trim() && price > 0 && !!city.trim() && photos.length >= 1;

  async function uploadAsset(asset: ImagePicker.ImagePickerAsset): Promise<EditPhoto | null> {
    const originalMime = resolveMime(asset);
    const optimized = await optimizePhoto(asset.uri, originalMime);
    const contentType = optimized.mimeType;
    const filename = sanitizeFilename(asset.fileName, extForMime(contentType));
    const { upload_url, public_url, path } = await requestUploadUrl.mutateAsync({
      kind: 'property',
      filename,
      content_type: contentType,
    });
    const blob = await (await fetch(optimized.uri)).blob();
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
      body: blob,
    });
    if (!putRes.ok) {
      const raw = await putRes.text().catch(() => '');
      console.error('[property-edit] storage PUT failed', putRes.status, raw);
      return null;
    }
    return { url: public_url, storage_path: path };
  }

  async function addPhotos() {
    if (uploading || photos.length >= MAX_PHOTOS) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.show(t('propertyEdit.photoPermission'), 'danger');
        return;
      }
      const remaining = MAX_PHOTOS - photos.length;
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      setUploading(true);
      const toUpload = picked.assets.slice(0, remaining);
      const uploaded: EditPhoto[] = [];
      for (const asset of toUpload) {
        try {
          const p = await uploadAsset(asset);
          if (p) uploaded.push(p);
        } catch (e) {
          console.error('[property-edit] one asset failed:', e);
        }
      }
      if (uploaded.length > 0) setPhotos((prev) => [...prev, ...uploaded]);
      if (uploaded.length < toUpload.length) toast.show(t('propertyEdit.uploadError'), 'danger');
    } catch (e) {
      toast.show(toToastMessage(e, t('propertyEdit.uploadError')), 'danger');
    } finally {
      setUploading(false);
    }
  }

  const removeAt = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  const makeCover = (i: number) =>
    setPhotos((prev) => (i === 0 ? prev : [prev[i], ...prev.filter((_, idx) => idx !== i)]));

  // ── Optional property video (client 2026-07-26) ─────────────────────────
  const resolveVideoMime = (asset: ImagePicker.ImagePickerAsset): string => {
    const m = asset.mimeType?.toLowerCase();
    if (m === 'video/mp4' || m === 'video/quicktime' || m === 'video/webm') return m;
    const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  };
  async function pickVideo() {
    if (videoUploading) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show(t('propertyEdit.photoPermission'), 'danger'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 0.7 });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      if (typeof asset.duration === 'number' && asset.duration > 65_000) {
        toast.show(t('create.videoTooLong'), 'danger');
        return;
      }
      setVideoUploading(true);
      const contentType = resolveVideoMime(asset);
      const ext = contentType === 'video/quicktime' ? 'mov' : contentType === 'video/webm' ? 'webm' : 'mp4';
      const { upload_url, public_url } = await requestUploadUrl.mutateAsync({
        kind: 'property-video',
        filename: `video.${ext}`,
        content_type: contentType,
      });
      const blob = await (await fetch(asset.uri)).blob();
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
        body: blob,
      });
      if (!putRes.ok) { toast.show(t('create.videoUploadError'), 'danger'); return; }
      setVideoUrl(public_url);
    } catch (e) {
      toast.show(toToastMessage(e, t('create.videoUploadError')), 'danger');
    } finally {
      setVideoUploading(false);
    }
  }

  async function onSave() {
    if (!canSave || update.isPending || !prop) return;
    try {
      await update.mutateAsync({
        id: prop.id,
        type,
        title: title.trim(),
        description: description.trim(),
        per_month: type === 'location' ? perMonth : undefined,
        price_minor: price,
        area_sqm: area || null,
        bedrooms: isTerrain ? null : rooms || null,
        furnished: isTerrain ? null : furnished,
        city: city.trim(),
        district: district.trim() || null,
        distance_to_road_m: distance,
        ...(photosDirty
          ? {
              photos: photos
                .filter((p) => p.storage_path)
                .map((p, i) => ({ url: p.url, storage_path: p.storage_path, position: i })),
            }
          : {}),
        ...(videoDirty ? { video_url: videoUrl } : {}),
      });
      toast.show(t('propertyEdit.successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, t('propertyEdit.errorToast')), 'danger');
    }
  }

  if (propertyQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('propertyEdit.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={44} radius={12} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={120} radius={12} />
        </View>
      </SafeAreaView>
    );
  }
  if (propertyQuery.isError || !prop) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('propertyEdit.topbar')} back />
        <ErrorStateView onRetry={() => void propertyQuery.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('propertyEdit.topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12, marginTop: 12 }}>
            {/* Photos — add / remove / set cover, in place (client 2026-07-22) */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('propertyEdit.photosLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {photos.length} / {MAX_PHOTOS}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {photos.map((p, i) => (
                  <View
                    key={`${p.url}-${i}`}
                    style={{
                      width: '31%',
                      aspectRatio: 1,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.bgSunken,
                      position: 'relative',
                    }}
                  >
                    <Image source={{ uri: p.url }} style={{ flex: 1 }} contentFit="cover" />
                    {i === 0 ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          paddingHorizontal: 7,
                          height: 20,
                          borderRadius: 999,
                          backgroundColor: colors.accent,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Star size={9} color="#2A1A05" fill="#2A1A05" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#2A1A05' }}>
                          {t('propertyEdit.coverBadge')}
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => makeCover(i)}
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          backgroundColor: 'rgba(0,0,0,0.55)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        accessibilityLabel={t('propertyEdit.setCover')}
                      >
                        <Star size={12} color="#FFFFFF" strokeWidth={2} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => removeAt(i)}
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      accessibilityLabel={t('propertyEdit.removePhoto')}
                    >
                      <Trash2 size={12} color="#FFFFFF" strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable
                    onPress={addPhotos}
                    disabled={uploading}
                    style={{
                      width: '31%',
                      aspectRatio: 1,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: colors.border,
                      borderStyle: 'dashed',
                      backgroundColor: colors.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: uploading ? 0.6 : 1,
                    }}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <>
                        <Plus size={20} color={colors.text} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text }}>
                          {t('propertyEdit.addPhoto')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* Video (optional) — add / replace / remove (client 2026-07-26) */}
            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('create.videoLabel')}
              </Text>
              {videoUrl ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Film size={18} color={colors.primary} strokeWidth={2} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>{t('create.videoAdded')}</Text>
                  <Pressable onPress={() => setVideoUrl(null)} hitSlop={8} accessibilityLabel={t('create.videoRemove')}>
                    <Trash2 size={18} color={colors.danger} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickVideo}
                  disabled={videoUploading}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card, opacity: videoUploading ? 0.6 : 1 }}
                >
                  {videoUploading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <Film size={18} color={colors.text} strokeWidth={2} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{t('create.videoAdd')}</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('propertyEdit.typeLabel')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {PROPERTY_TYPES.map((tp) => (
                  <Chip key={tp.id} label={tp.label} active={type === tp.id} onPress={() => selectType(tp.id)} block />
                ))}
              </View>
            </View>

            <Input
              label={t('propertyEdit.titleLabel')}
              value={title}
              onChangeText={(txt) => setTitle(txt.slice(0, 30))}
              maxLength={30}
              helperText={`${title.length} / 30`}
            />

            {type === 'location' && (
              <View>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                  {t('propertyEdit.rentalPeriodLabel')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Chip label={t('propertyEdit.rentalPeriodMonth')} active={perMonth} onPress={() => setPerMonth(true)} block />
                  <Chip label={t('propertyEdit.rentalPeriodDay')} active={!perMonth} onPress={() => setPerMonth(false)} block />
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={type === 'location' ? (perMonth ? t('propertyEdit.pricePerMonth') : t('propertyEdit.pricePerDay')) : t('propertyEdit.priceLabel')}
                  value={new Intl.NumberFormat('fr-FR').format(price)}
                  onChangeText={(txt) => setPrice(Number(txt.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ width: 110 }}>
                <Input
                  label={t('propertyEdit.areaLabel')}
                  value={String(area)}
                  onChangeText={(txt) => setArea(Number(txt.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <CitySelectField value={city} onChange={setCity} />
              </View>
              {!isTerrain && (
                <View style={{ width: 100 }}>
                  <Input
                    label={t('propertyEdit.roomsLabel')}
                    value={String(rooms)}
                    onChangeText={(txt) => setRooms(Number(txt.replace(/\D/g, '')) || 0)}
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </View>

            <Input label={t('propertyEdit.districtLabel')} value={district} onChangeText={setDistrict} placeholder={t('propertyEdit.districtPlaceholder')} />

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('propertyEdit.descriptionLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {description.length} / 600
                </Text>
              </View>
              <Input multiline value={description} onChangeText={(txt) => setDescription(txt.slice(0, 600))} />
            </View>

            {/* Distance au goudron — plain field, same treatment as the
                create wizard (client ask 2026-07-06). */}
            <Input
              label={t('propertyEdit.fieldDistance')}
              value={String(distance)}
              onChangeText={(txt) => setDistance(Number(txt.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
            />

            {!isTerrain && (
              <View
                style={{
                  padding: 14,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('propertyEdit.furnishedLabel')}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                    {t('propertyEdit.furnishedSub')}
                  </Text>
                </View>
                <Switch value={furnished} onChange={setFurnished} />
              </View>
            )}

            {/* Boost — paid visibility for this property (client 2026-07-29:
                boost extended from Boutique to Immobilier). Opens the boost flow
                with this listing pre-selected. push() so edit state survives a
                cancel. Only an active listing can be boosted. */}
            {prop && prop.status === 'active' && (
              <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('productEdit.boostHint')}
                </Text>
                <Button
                  variant="saffron"
                  size="lg"
                  block
                  label={t('productEdit.boostCta')}
                  leading={<Rocket size={18} color="#2A1A05" strokeWidth={2.25} />}
                  onPress={() =>
                    router.push({ pathname: '/pro/boost/new', params: { propertyId: prop.id } })
                  }
                />
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer sits outside the top-only SafeAreaView, so pad by the real bottom
            inset or the action hides behind the Android nav bar (client 2026-08-05). */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Button variant="dark" size="lg" block label={t('propertyEdit.save')} onPress={onSave} loading={update.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
