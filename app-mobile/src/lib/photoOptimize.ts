import { Image as RNImage } from 'react-native';

const MAX_WIDTH = 1600;
const QUALITY = 0.85;

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp';

interface Optimized {
  uri: string;
  width: number;
  height: number;
  mimeType: AllowedMime;
}

// Probes the image dimensions; if width > MAX_WIDTH, resizes down (preserving aspect
// ratio) and re-encodes as jpeg at QUALITY. Photos already <= MAX_WIDTH pass through
// untouched (preserves the original mime + avoids generation loss). The returned
// mimeType always matches the actual uri's encoding so the caller can use it for the
// Storage Content-Type header without thinking.
//
// expo-image-manipulator is lazy-imported so a dev-client APK built before the package
// was installed can still upload (pass-through, no resize). Rebuild the dev client to
// enable actual optimization.
export async function optimizePhoto(uri: string, originalMime: AllowedMime): Promise<Optimized> {
  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

  if (dims.width <= MAX_WIDTH) {
    return { uri, width: dims.width, height: dims.height, mimeType: originalMime };
  }

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: QUALITY, format: SaveFormat.JPEG },
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      mimeType: 'image/jpeg',
    };
  } catch (e: unknown) {
    // Native module missing (dev-client APK predates the install) OR other manipulator
    // failure. Fall back to uploading the original — the upload still works, just larger.
    console.warn('[photoOptimize] manipulator unavailable, uploading original:', e);
    return { uri, width: dims.width, height: dims.height, mimeType: originalMime };
  }
}
