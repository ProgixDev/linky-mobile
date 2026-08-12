// Seller edits an existing product. Reachable from the product detail page's
// "Modifier" CTA and the boutique dashboard's manage sheet. Covers every
// product field INCLUDING photos (client 2026-07-22 — previously photos could
// only be changed by deleting + recreating the listing). Wired to
// useUpdateProduct -> /product-update, which accepts a photos[] array.
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
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { useProduct, useUpdateProduct } from '../../../src/data/queries';
import { useRequestPhotoUploadUrl } from '../../../src/data/queries/products';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { gnfToEur } from '../../../src/lib/currency';
import { optimizePhoto } from '../../../src/lib/photoOptimize';

const CONDITIONS = ['neuf', 'occasion', 'reconditionné'] as const;
// Phase I.3j — stable backend ids ; the visible label is resolved at render
// time via t() so the chip strip flips with the active language.
const CONDITION_LABEL_KEY: Record<(typeof CONDITIONS)[number], string> = {
  neuf: 'productEdit.condNeuf',
  occasion: 'productEdit.condOccasion',
  reconditionné: 'productEdit.condReconditionne',
};

const MAX_PHOTOS = 8;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];

// Backend filename regex is ^[A-Za-z0-9._-]{1,80}$ — strip anything else and
// clamp from the tail (keeps the extension). Mirrors the create-photos flow.
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

export default function ProductEditRoute() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const conditionLabel = useMemo(
    () => Object.fromEntries(
      CONDITIONS.map((c) => [c, t(CONDITION_LABEL_KEY[c])]),
    ) as Record<(typeof CONDITIONS)[number], string>,
    [t],
  );
  const productQuery = useProduct(id);
  const update = useUpdateProduct();
  const requestUploadUrl = useRequestPhotoUploadUrl();
  const product = productQuery.data;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>('occasion');
  const [city, setCity] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (product && !hydrated) {
    setTitle(product.title);
    setDescription(product.description);
    setPrice(product.priceGnf);
    setCondition(product.condition as (typeof CONDITIONS)[number]);
    setCity(product.city ?? '');
    setPhotos(product.photos ?? []);
    setVideoUrl(product.videoUrl);
    setHydrated(true);
  }

  const photosDirty =
    hydrated && !!product && JSON.stringify(photos) !== JSON.stringify(product.photos ?? []);
  const videoDirty =
    hydrated && !!product && (videoUrl ?? null) !== (product.videoUrl ?? null);
  const dirty =
    hydrated &&
    !!product &&
    (title.trim() !== product.title ||
      description.trim() !== product.description ||
      price !== product.priceGnf ||
      condition !== product.condition ||
      city.trim() !== (product.city ?? '') ||
      photosDirty ||
      videoDirty);
  const canSave = dirty && !!title.trim() && price > 0 && !!city.trim() && photos.length >= 1;

  // Optimize + upload one asset -> its public URL, or null on failure.
  async function uploadAsset(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
    const originalMime = resolveMime(asset);
    const optimized = await optimizePhoto(asset.uri, originalMime);
    const contentType = optimized.mimeType;
    const filename = sanitizeFilename(asset.fileName, extForMime(contentType));
    const { upload_url, public_url } = await requestUploadUrl.mutateAsync({
      kind: 'product',
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
      console.error('[product-edit] storage PUT failed', putRes.status, raw);
      return null;
    }
    return public_url;
  }

  async function addPhotos() {
    if (uploading || photos.length >= MAX_PHOTOS) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.show(t('productEdit.photoPermission'), 'danger');
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
      const uploaded: string[] = [];
      for (const asset of toUpload) {
        try {
          const url = await uploadAsset(asset);
          if (url) uploaded.push(url);
        } catch (e) {
          console.error('[product-edit] one asset failed:', e);
        }
      }
      if (uploaded.length > 0) setPhotos((prev) => [...prev, ...uploaded]);
      if (uploaded.length < toUpload.length) toast.show(t('productEdit.uploadError'), 'danger');
    } catch (e) {
      toast.show(toToastMessage(e, t('productEdit.uploadError')), 'danger');
    } finally {
      setUploading(false);
    }
  }

  const removeAt = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  const makeCover = (i: number) =>
    setPhotos((prev) => (i === 0 ? prev : [prev[i], ...prev.filter((_, idx) => idx !== i)]));

  // ── Optional product video (client 2026-08-03) ──
  const MAX_VIDEO_SEC = 60;
  const resolveVideoMime = (asset: ImagePicker.ImagePickerAsset): string => {
    const m = asset.mimeType?.toLowerCase();
    if (m === 'video/mp4' || m === 'video/quicktime' || m === 'video/webm') return m;
    const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  };
  const videoExt = (mime: string): string =>
    mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4';

  async function pickVideo() {
    if (videoUploading) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.show(t('productEdit.photoPermission'), 'danger');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 0.7 });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      if (typeof asset.duration === 'number' && asset.duration > (MAX_VIDEO_SEC + 5) * 1000) {
        toast.show(t('create.videoTooLong'), 'danger');
        return;
      }
      setVideoUploading(true);
      const contentType = resolveVideoMime(asset);
      const filename = `video.${videoExt(contentType)}`;
      const { upload_url, public_url } = await requestUploadUrl.mutateAsync({
        kind: 'product-video',
        filename,
        content_type: contentType,
      });
      const blob = await (await fetch(asset.uri)).blob();
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
        body: blob,
      });
      if (!putRes.ok) {
        const raw = await putRes.text().catch(() => '');
        console.error('[product-edit-video] storage PUT failed', putRes.status, raw);
        toast.show(t('create.videoUploadError'), 'danger');
        return;
      }
      setVideoUrl(public_url);
    } catch (e) {
      toast.show(toToastMessage(e, t('create.videoUploadError')), 'danger');
    } finally {
      setVideoUploading(false);
    }
  }
  const removeVideo = () => setVideoUrl(undefined);

  async function onSave() {
    if (!canSave || update.isPending || !product) return;
    try {
      await update.mutateAsync({
        id: product.id,
        title: title.trim(),
        description: description.trim(),
        price_minor: price,
        condition,
        city: city.trim(),
        ...(photosDirty ? { photos } : {}),
        ...(videoDirty ? { video_url: videoUrl ?? null } : {}),
      });
      toast.show(t('productEdit.successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, t('productEdit.errorToast')), 'danger');
    }
  }

  if (productQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('productEdit.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={56} radius={12} />
          <Skeleton height={120} radius={12} />
          <Skeleton height={56} radius={12} />
        </View>
      </SafeAreaView>
    );
  }
  if (productQuery.isError || !product) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('productEdit.topbar')} back />
        <ErrorStateView onRetry={() => void productQuery.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('productEdit.topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12, marginTop: 12 }}>
            {/* Photos — add / remove / set cover, in place (client 2026-07-22) */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('productEdit.photosLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {photos.length} / {MAX_PHOTOS}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {photos.map((uri, i) => (
                  <View
                    key={`${uri}-${i}`}
                    style={{
                      width: '31%',
                      aspectRatio: 1,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.bgSunken,
                      position: 'relative',
                    }}
                  >
                    <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
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
                          {t('productEdit.coverBadge')}
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
                        accessibilityLabel={t('productEdit.setCover')}
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
                      accessibilityLabel={t('productEdit.removePhoto')}
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
                          {t('productEdit.addPhoto')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* Vidéo produit (optionnel) — client 2026-08-03, parité immo */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                {t('create.videoLabel')}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 10 }}>
                {t('create.videoHint')}
              </Text>
              {videoUrl ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Film size={18} color={colors.primary} strokeWidth={2} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>
                    {t('create.videoAdded')}
                  </Text>
                  <Pressable onPress={removeVideo} hitSlop={8} accessibilityLabel={t('create.videoRemove')}>
                    <Trash2 size={18} color={colors.danger} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickVideo}
                  disabled={videoUploading}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: 50,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    opacity: videoUploading ? 0.6 : 1,
                  }}
                >
                  {videoUploading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <Film size={18} color={colors.text} strokeWidth={2} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                        {t('create.videoAdd')}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <Input
              label={t('productEdit.titleLabel')}
              value={title}
              // Pas de maxLength ni de troncature ici : une annonce publiee AVANT
              // la limite peut depasser 30 signes. maxLength bloquerait alors
              // toute frappe — le vendeur ne pourrait plus modifier son titre du
              // tout — et une troncature effacerait son texte des qu'il touche le
              // champ. On autorise donc a RACCOURCIR librement, jamais a
              // rallonger au-dela de la limite.
              onChangeText={(txt) =>
                setTitle(txt.length > title.length && txt.length > 30 ? title : txt)
              }
              helperText={`${title.length} / 30`}
            />

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('productEdit.descriptionLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {description.length} / 600
                </Text>
              </View>
              <Input multiline value={description} onChangeText={(txt) => setDescription(txt.slice(0, 600))} />
            </View>

            <Input
              label={t('productEdit.priceLabel')}
              value={new Intl.NumberFormat('fr-FR').format(price)}
              onChangeText={(txt) => setPrice(Number(txt.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              helperText={`≈ ${gnfToEur(price)} €`}
            />

            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('productEdit.conditionLabel')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CONDITIONS.map((c) => (
                  <Chip key={c} label={conditionLabel[c]} active={condition === c} onPress={() => setCondition(c)} block />
                ))}
              </View>
            </View>

            <CitySelectField value={city} onChange={setCity} />

            {/* Boost — paid visibility for this listing (products only). Kept
                separate from Save; opens the boost flow with this product
                pre-selected. push() so the edit state survives a cancel. */}
            {product.status === 'active' && (
              <View
                style={{
                  marginTop: 8,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  gap: 8,
                }}
              >
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
                    router.push({ pathname: '/pro/boost/new', params: { productId: product.id } })
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
          <Button variant="dark" size="lg" block label={t('productEdit.save')} onPress={onSave} loading={update.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
