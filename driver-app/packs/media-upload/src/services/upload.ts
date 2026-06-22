import * as ImagePicker from 'expo-image-picker';

import { logger } from '@/shared/lib/logger';
import { supabase } from '@/shared/lib/supabase';

import { BUCKET, type UploadedMedia } from '../model/media';

type PickResult =
  | { ok: true; uri: string; mimeType: string; fileName: string }
  | { ok: false; reason: 'denied' | 'cancelled' };

type UploadResult = { ok: true; value: UploadedMedia } | { ok: false; error: string };

/** Ask for library access and let the user pick one image. Never throws. */
export async function pickImage(): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied' };

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };

  const asset = res.assets[0];
  return {
    ok: true,
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
  };
}

/**
 * Upload a local file URI to the user's private folder in the bucket.
 * Path is "<uid>/<timestamp>_<name>" — the leading uid is what RLS enforces.
 */
export async function uploadImage(
  uri: string,
  mimeType: string,
  fileName: string,
): Promise<UploadResult> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };

  try {
    // Read the file as an ArrayBuffer for a reliable React Native upload.
    const body = await (await fetch(uri)).arrayBuffer();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${me.id}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, { contentType: mimeType, upsert: false });
    if (error) return { ok: false, error: error.message };

    return { ok: true, value: { path, contentType: mimeType } };
  } catch (err) {
    logger.warn('media: upload failed', { err });
    return { ok: false, error: 'Upload failed. Check your connection and try again.' };
  }
}
