import { Image, View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useMediaUpload } from '../use-media-upload';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder that
 * proves pick → upload (private bucket) → signed-URL preview end to end.
 */
export function MediaUploadScreen() {
  const { state, previewUrl, error, pickAndUpload } = useMediaUpload();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <AppText variant="display">Upload a photo</AppText>
        {previewUrl ? (
          <Image
            source={{ uri: previewUrl }}
            className="h-64 w-full rounded-card bg-surface-muted"
            resizeMode="cover"
          />
        ) : null}
        <Button
          testID="media-pick"
          label={state === 'uploading' ? 'Uploading…' : 'Choose photo'}
          loading={state === 'uploading'}
          onPress={() => void pickAndUpload()}
        />
        {error ? (
          <AppText testID="media-error" variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
