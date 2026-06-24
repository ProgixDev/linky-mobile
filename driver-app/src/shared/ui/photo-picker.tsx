import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images as GalleryIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { uploadAvatar } from '@/shared/lib/photo-upload';
import { colors } from '@/shared/theme/colors';

import { AppText } from './text';

type Props = {
  value: string | null;
  onChange: (url: string) => void;
  disabled?: boolean;
  testID?: string;
};

const PICK_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

/**
 * Avatar capture — a circular face photo for the courier. Camera-first (front
 * selfie), with a gallery fallback so a denied camera permission is never a dead end.
 * Crops square, compresses + uploads via uploadAvatar, reports the public URL. Shows
 * busy + error states. NOT exported from the shared barrel: it pulls native image
 * modules, so only direct importers (application form, profil) take that weight.
 */
export function PhotoPicker({ value, onChange, disabled, testID = 'photo-picker' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const process = async (uri: string | undefined) => {
    if (!uri) return;
    setBusy(true);
    setError(null);
    const r = await uploadAvatar(uri);
    setBusy(false);
    if (r.ok) onChange(r.url);
    else setError(r.message);
  };

  const fromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync(PICK_OPTS);
    if (!res.canceled) await process(res.assets[0]?.uri);
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      // Denied → fall back to the gallery rather than block the courier.
      await fromGallery();
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      ...PICK_OPTS,
      cameraType: ImagePicker.CameraType.front,
    });
    if (!res.canceled) await process(res.assets[0]?.uri);
  };

  return (
    <View testID={testID} className="items-center gap-3">
      <Pressable
        testID={`${testID}-avatar`}
        accessibilityRole="button"
        accessibilityLabel="Prendre ou changer ta photo"
        disabled={disabled || busy}
        onPress={() => void fromCamera()}
        className="h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-brand-500/30 bg-surface-muted"
      >
        {busy ? (
          <ActivityIndicator testID={`${testID}-busy`} color={colors.brand500} />
        ) : value ? (
          <Image source={{ uri: value }} contentFit="cover" className="h-full w-full" />
        ) : (
          <Camera size={30} color={colors.brand500} strokeWidth={1.75} />
        )}
      </Pressable>

      <View className="flex-row gap-2">
        <Pressable
          testID={`${testID}-camera`}
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => void fromCamera()}
          className="flex-row items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2"
        >
          <Camera size={16} color={colors.brand600} strokeWidth={2.25} />
          <AppText variant="caption" className="font-sans-medium text-brand-700">
            {value ? 'Reprendre' : 'Prendre une photo'}
          </AppText>
        </Pressable>
        <Pressable
          testID={`${testID}-gallery`}
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => void fromGallery()}
          className="flex-row items-center gap-1.5 rounded-full bg-surface-muted px-3.5 py-2"
        >
          <GalleryIcon size={16} color={colors.ink} strokeWidth={2.25} />
          <AppText variant="caption" className="font-sans-medium text-ink">
            Galerie
          </AppText>
        </Pressable>
      </View>

      {error ? (
        <AppText testID={`${testID}-error`} variant="caption" className="text-danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
