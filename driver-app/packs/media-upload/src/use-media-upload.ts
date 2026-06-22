import { useState } from 'react';

import { signedUrlFor } from './data/media-repo';
import { pickImage, uploadImage } from './services/upload';

type State = 'idle' | 'uploading' | 'done' | 'error';

/**
 * Pick → upload → sign-for-preview in one call. Returns the latest preview URL
 * and a status the UI can render. All errors are surfaced as state, never thrown.
 */
export function useMediaUpload() {
  const [state, setState] = useState<State>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);

  const pickAndUpload = async () => {
    setError(null);
    const picked = await pickImage();
    if (!picked.ok) {
      if (picked.reason === 'denied') setError('Photo access is off. Enable it in Settings.');
      return;
    }

    setState('uploading');
    const up = await uploadImage(picked.uri, picked.mimeType, picked.fileName);
    if (!up.ok) {
      setState('error');
      setError(up.error);
      return;
    }
    setPath(up.value.path);

    const signed = await signedUrlFor(up.value.path);
    setPreviewUrl(signed.ok ? signed.value : null);
    setState('done');
  };

  return { state, previewUrl, path, error, pickAndUpload };
}
