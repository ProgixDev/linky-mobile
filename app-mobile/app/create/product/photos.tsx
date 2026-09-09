import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  pickPhotos,
  nativeChooserAvailable,
  type MediaSource,
  type PickedAsset,
  type PickSource,
} from '../../../src/lib/pickPhotos';
import { chooseVideoNative } from '../../../src/lib/nativeMediaChooser';
import { MediaSourceSheet } from '../../../src/components/sheets/MediaSourceSheet';
import { VideoThumb } from '../../../src/components/media/VideoThumb';
import { Film, Trash2 } from 'lucide-react-native';
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

function resolveMime(asset: PickedAsset): AllowedMime {
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
  const [sourceOpen, setSourceOpen] = useState(false);
  const [videoSourceOpen, setVideoSourceOpen] = useState(false);
  // Optional product video (client 2026-08-03 — parity with immo). Shares the
  // createListing store's videoUrl field.
  const videoUrl = useCreateListing((s) => s.videoUrl);
  const [videoUploading, setVideoUploading] = useState(false);

  const remaining = MAX_PHOTOS - photos.length;
  const canAdd = remaining > 0 && !uploading;

  // Upload a single picked asset → returns its public URL, or null on failure.
  async function uploadAsset(asset: PickedAsset): Promise<string | null> {
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

  /** Ouvre la feuille de choix. Le travail reel se fait dans runPick. */
  function handleAdd() {
    if (!canAdd) return;
    // SELECTEUR NATIF quand le binaire le porte (client 2026-09-09) : un seul
    // ecran systeme propose l'appareil photo et la galerie. Sinon — iOS, ou un
    // telephone encore sur l'ancien build — la feuille de choix reste.
    if (nativeChooserAvailable) {
      void runPick('system');
      return;
    }
    setSourceOpen(true);
  }

  async function runPick(source: PickSource) {
    try {
      // Camera OU galerie (client 2026-08-23) : le vendeur photographie sa
      // marchandise sur place. La galerie seule l'obligeait a quitter l'app.
      // pickPhotos gere le choix, les permissions et le plafond restant.
      const toUpload = await pickPhotos({
        source,
        remaining,
        labels: {
          galleryDenied: t('create.photosPermDenied'),
          cameraDenied: t('create.photosCamPermDenied'),
          systemTitle: t('create.photoSourceTitle'),
        },
        onDenied: (m) => show(m, 'danger'),
      });
      if (toUpload.length === 0) return;

      setUploading(true);
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

  // ── Optional product video (client 2026-08-03) ──────────────────────────
  const MAX_VIDEO_SEC = 60;
  const resolveVideoMime = (asset: PickedAsset): string => {
    const m = asset.mimeType?.toLowerCase();
    if (m === 'video/mp4' || m === 'video/quicktime' || m === 'video/webm') return m;
    const ext = (asset.fileName || asset.uri).toLowerCase().split('.').pop() ?? '';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  };
  const videoExt = (mime: string): string =>
    mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4';

  /** Ouvre la feuille de choix video. Le travail reel se fait dans runVideo. */
  function pickVideo() {
    if (videoUploading) return;
    if (nativeChooserAvailable) {
      void runVideo('system');
      return;
    }
    setVideoSourceOpen(true);
  }

  async function runVideo(source: PickSource) {
    try {
      // La camera etait absente : le vendeur devait sortir de l'app, filmer,
      // revenir. Demande du client le 2026-09-08 (« toujours acces a la
      // camera »), exactement comme pour les photos.
      let asset: PickedAsset | undefined;
      if (source === 'system') {
        // SELECTEUR NATIF (client 2026-09-09) : l'appareil photo et la galerie
        // video dans le meme ecran systeme. La permission camera se demande
        // AVANT, puisqu'on ignore ce que l'utilisateur va choisir ; un refus
        // n'empeche rien, le selecteur s'ouvre alors sans l'entree camera.
        // Le plafond de duree est passe au natif, qui coupe A LA PRISE.
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        const chosen = await chooseVideoNative(
          cam.granted,
          t('create.videoSourceTitle'),
          MAX_VIDEO_SEC,
        );
        asset = chosen[0];
      } else {
        const perm = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          // Le message doit nommer la permission REFUSEE : « autorisez l'acces aux
          // photos » alors qu'on vient de demander la camera envoie l'utilisateur
          // regler le mauvais interrupteur dans les parametres du telephone.
          show(t(source === 'camera' ? 'create.photosCamPermDenied' : 'create.photosPermDenied'), 'danger');
          return;
        }
        // videoMaxDuration coupe A LA PRISE plutot que de refuser apres coup :
        // filmer 3 minutes puis se faire jeter est la pire facon de l'apprendre.
        const picked = source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: 'videos',
              quality: 0.7,
              videoMaxDuration: MAX_VIDEO_SEC,
            })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 0.7 });
        if (picked.canceled || picked.assets.length === 0) return;
        asset = picked.assets[0];
      }
      if (!asset) return;
      if (typeof asset.duration === 'number' && asset.duration > (MAX_VIDEO_SEC + 5) * 1000) {
        show(t('create.videoTooLong'), 'danger');
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
        console.error('[product-video] storage PUT failed', putRes.status, raw);
        show(t('create.videoUploadError'), 'danger');
        return;
      }
      setVal('videoUrl', public_url);
    } catch (e) {
      show(toToastMessage(e, t('create.videoUploadError')), 'danger');
    } finally {
      setVideoUploading(false);
    }
  }
  const removeVideo = () => setVal('videoUrl', undefined);

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

        {/* Vidéo produit (optionnel) — client 2026-08-03, parité immo */}
        <View style={{ marginTop: 24 }}>
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
              {/* La PREMIERE IMAGE de la video, pas une icone de pellicule
                  (client 2026-09-08). L'icone ne disait pas QUELLE video venait
                  d'etre ajoutee, ni si le televersement avait pris la bonne. */}
              <VideoThumb uri={videoUrl} style={{ width: 52, height: 52, borderRadius: 10 }} />
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
      </View>
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} disabled={uploading || videoUploading} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={uploading}
          onPress={() => router.push('/create/product/preview')}
        />
      </StickyBottom>
      <MediaSourceSheet
        kind="photo"
        open={sourceOpen}
        remaining={remaining}
        onPick={runPick}
        onClose={() => setSourceOpen(false)}
      />
      <MediaSourceSheet
        kind="video"
        open={videoSourceOpen}
        onPick={runVideo}
        onClose={() => setVideoSourceOpen(false)}
      />
    </SafeAreaView>
  );
}
