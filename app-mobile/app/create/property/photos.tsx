import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Plus, Trash2, Star } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useCreateListing } from '../../../src/stores/createListing';
import { useRequestPhotoUploadUrl } from '../../../src/data/queries/products';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { optimizePhoto } from '../../../src/lib/photoOptimize';

const MAX_PHOTOS = 12;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];

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

export default function PropertyPhotosRoute() {
  const { colors } = useTheme();
  const propertyPhotos = useCreateListing((s) => s.propertyPhotos);
  const setVal = useCreateListing((s) => s.set);
  const valid = propertyPhotos.length >= 3;
  const requestUploadUrl = useRequestPhotoUploadUrl();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const removeAt = (i: number) => {
    haptic.light();
    const next = propertyPhotos
      .filter((_, idx) => idx !== i)
      .map((p, idx) => ({ ...p, position: idx }));
    setVal('propertyPhotos', next);
  };

  async function addOne() {
    if (uploading || propertyPhotos.length >= MAX_PHOTOS) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.show('Autorise l’accès aux photos pour continuer', 'danger');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsMultipleSelection: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;

      setUploading(true);
      haptic.light();
      const asset = picked.assets[0];
      // Optimize before upload: resize > 1600px down + re-encode as jpeg. Cuts
      // typical camera output from ~3-5 MB to ~250-500 KB. Pass-through for small inputs.
      const originalMime = resolveMime(asset);
      const optimized = await optimizePhoto(asset.uri, originalMime);
      const contentType = optimized.mimeType;
      const filename = sanitizeFilename(asset.fileName, extForMime(contentType));

      const { upload_url, public_url, path } = await requestUploadUrl.mutateAsync({
        kind: 'property',
        filename,
        content_type: contentType,
      });

      const fileRes = await fetch(optimized.uri);
      const blob = await fileRes.blob();
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
        body: blob,
      });
      if (!putRes.ok) {
        const raw = await putRes.text().catch(() => '');
        console.error('[property-photos] storage PUT failed', putRes.status, raw);
        toast.show('Téléversement échoué', 'danger');
        return;
      }

      setVal('propertyPhotos', [
        ...propertyPhotos,
        { url: public_url, storage_path: path, position: propertyPhotos.length },
      ]);
    } catch (e: unknown) {
      console.error('[property-photos] add error:', e);
      toast.show(toToastMessage(e, 'Téléversement échoué'), 'danger');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader
          title="Ajoute des photos"
          subtitle="Au moins 3 photos, la première sert de couverture."
        />

        {/* Cover slot */}
        {propertyPhotos[0] && (
          <View style={{ paddingHorizontal: 24, marginBottom: 14 }}>
            <View
              style={{
                height: 240,
                borderRadius: 22,
                overflow: 'hidden',
                backgroundColor: colors.bgSunken,
                position: 'relative',
              }}
            >
              <Image source={{ uri: propertyPhotos[0].url }} style={{ flex: 1 }} contentFit="cover" />
              <View
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  paddingHorizontal: 10,
                  height: 26,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Star size={11} color="#2A1A05" fill="#2A1A05" />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: '#2A1A05',
                    lineHeight: 13,
                    includeFontPadding: false,
                    letterSpacing: 0.3,
                  }}
                >
                  COUVERTURE
                </Text>
              </View>
              <Pressable
                onPress={() => removeAt(0)}
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={15} color="#FFFFFF" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Thumbnails grid */}
        <View
          style={{
            paddingHorizontal: 24,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {propertyPhotos.slice(1).map((p, i) => (
            <View
              key={i}
              style={{
                width: '47%',
                aspectRatio: 1,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: colors.bgSunken,
                position: 'relative',
              }}
            >
              <Image source={{ uri: p.url }} style={{ flex: 1 }} contentFit="cover" />
              <Pressable
                onPress={() => removeAt(i + 1)}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={12} color="#FFFFFF" strokeWidth={2} />
              </Pressable>
            </View>
          ))}

          {/* Add tile */}
          <Pressable
            onPress={addOne}
            disabled={uploading || propertyPhotos.length >= MAX_PHOTOS}
            style={{
              width: '47%',
              aspectRatio: 1,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: colors.border,
              borderStyle: 'dashed',
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Plus size={22} color={colors.text} strokeWidth={2} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.text,
                    letterSpacing: 0,
                  }}
                >
                  Ajouter
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Tip */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Camera size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                color: colors.textMuted,
                lineHeight: 18,
                letterSpacing: 0,
              }}
            >
              Photos prises de jour, sans flash, qui montrent toutes les pièces. Pas de filtres
              trompeurs.
            </Text>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          disabled={!valid}
          onPress={() => {
            haptic.medium();
            router.push('/create/property/amenities');
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: valid ? colors.text : colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: valid ? 1 : 0.6,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: valid ? colors.bg : colors.textFaint,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            Continuer · {propertyPhotos.length} photo{propertyPhotos.length > 1 ? 's' : ''}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}
