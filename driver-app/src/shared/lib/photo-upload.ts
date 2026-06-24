import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { apiPost } from '@/shared/lib/api';

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; message: string };

type UploadUrlResponse = { upload_url: string; public_url: string; content_type: string };

const CONTENT_TYPE = 'image/jpeg';
const FAIL = 'Échec de l’envoi de la photo. Vérifie ta connexion et réessaie.';

/**
 * Compress + upload a local image to the `avatars` bucket via the backend's signed
 * upload URL (/photo-upload-url), returning the stored public URL. Resizes to ≤1024px
 * wide and JPEG-compresses for the 3G budget. Never throws — all failures collapse to
 * { ok: false, message }.
 */
export async function uploadAvatar(localUri: string): Promise<PhotoUploadResult> {
  try {
    const compressed = await manipulateAsync(localUri, [{ resize: { width: 1024 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    const signed = await apiPost<UploadUrlResponse>({
      path: '/photo-upload-url',
      body: { kind: 'avatar', filename: 'photo.jpg', content_type: CONTENT_TYPE },
    });
    const res = await uploadAsync(signed.upload_url, compressed.uri, {
      httpMethod: 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': CONTENT_TYPE, 'x-upsert': 'true' },
    });
    if (res.status < 200 || res.status >= 300) return { ok: false, message: FAIL };
    return { ok: true, url: signed.public_url };
  } catch {
    return { ok: false, message: FAIL };
  }
}
