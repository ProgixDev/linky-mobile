import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { I } from '../../../src/icons/Icon';
import { useCreateListing } from '../../../src/stores/createListing';
import { useRequestPhotoUploadUrl } from '../../../src/data/queries/products';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { optimizePhoto } from '../../../src/lib/photoOptimize';

const MAX_PHOTOS = 8;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = typeof ALLOWED_MIMES[number];

// Backend filename regex is ^[A-Za-z0-9._-]{1,80}$ — Android pickers can return names
// with spaces/parens/accents, so strip everything else and clamp length from the tail
// (keeps the extension if any).
function sanitizeFilename(raw: string | null | undefined, fallbackExt: string): string {
  const base = (raw ?? `photo.${fallbackExt}`).replace(/[^A-Za-z0-9._-]/g, '');
  const trimmed = base.length > 80 ? base.slice(base.length - 80) : base;
  return trimmed || `photo.${fallbackExt}`;
}

function resolveMime(asset: ImagePicker.ImagePickerAsset): AllowedMime {
  const m = asset.mimeType?.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return m;
  // Fall back to extension sniff, then jpeg.
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

export default function CreatePhotosRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const photos = useCreateListing((s) => s.photos);
  const setVal = useCreateListing((s) => s.set);
  const requestUploadUrl = useRequestPhotoUploadUrl();
  const { show } = useToast();
  const [uploading, setUploading] = useState(false);

  const remaining = MAX_PHOTOS - photos.length;
  const canAdd = remaining > 0 && !uploading;

  // Upload a single picked asset → returns its public URL, or null on failure.
  async function uploadAsset(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
    // Optimize before upload: resize > 1600px down + re-encode as jpeg. Cuts
    // typical camera output from ~3-5 MB to ~250-500 KB. Pass-through for small inputs.
    const originalMime = resolveMime(asset);
    const optimized = await optimizePhoto(asset.uri, originalMime);
    const contentType = optimized.mimeType;
    const filename = sanitizeFilename(asset.fileName, extForMime(contentType));

    const { upload_url, public_url } = await requestUploadUrl.mutateAsync({
      kind: 'product',
      filename,
      content_type: contentType,
    });

    // Turn the (possibly resized) file:// URI into a Blob for a raw PUT to Storage.
    const fileRes = await fetch(optimized.uri);
    const blob = await fileRes.blob();
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
      body: blob,
    });
    if (!putRes.ok) {
      const raw = await putRes.text().catch(() => '');
      console.error('[photos] storage PUT failed', putRes.status, raw);
      return null;
    }
    return public_url;
  }

  async function handleAdd() {
    if (!canAdd) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        show(t('create.photosPermDenied'), 'danger');
        return;
      }

      // Multi-select: the picker caps at `remaining` so we never exceed MAX_PHOTOS.
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
          console.error('[photos] one asset failed:', e);
        }
      }
      if (uploaded.length > 0) setVal('photos', [...photos, ...uploaded]);
      // Some selected photos didn't make it — tell the user rather than silently drop.
      if (uploaded.length < toUpload.length) show(t('create.photosUploadFailed'), 'danger');
    } catch (e: unknown) {
      console.error('[photos] add error:', e);
      show(toToastMessage(e, t('create.photosUploadFailed')), 'danger');
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number) {
    const next = photos.filter((_, i) => i !== index);
    setVal('photos', next);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={4} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 5, total: 6, label: t('create.stepPhotosLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6 }}>
          {t('create.stepPhotosTitle')}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 6, letterSpacing: 0 }}>
          {t('create.photosMaxHint', { max: MAX_PHOTOS })}
        </Text>

        <View
          style={{
            marginTop: 16,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {photos.map((uri, index) => (
            <Pressable
              key={`${uri}-${index}`}
              onLongPress={() => handleRemove(index)}
              delayLongPress={300}
              style={{
                width: '31.5%',
                aspectRatio: 1,
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: colors.bgElev,
              }}
            >
              <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
              {index === 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    backgroundColor: colors.accent,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#2A1A05', letterSpacing: 0.4 }}>
                    {t('create.photosMain')}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}

          {remaining > 0 && (
            <Pressable
              onPress={handleAdd}
              disabled={!canAdd}
              style={{
                width: '31.5%',
                aspectRatio: 1,
                borderRadius: 12,
                backgroundColor: colors.bgElev,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: canAdd ? 1 : 0.6,
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <>
                  <I.camera size={20} color={colors.textMuted} />
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                    {t('create.photosAdd')}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: 16 }}>
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              {photos.length === 0
                ? t('create.photosFirstHint')
                : t('create.photosLongPressHint')}
            </Text>
          </TrustStrip>
        </View>
      </View>
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} disabled={uploading} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={uploading}
          onPress={() => router.push('/create/product/preview')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
