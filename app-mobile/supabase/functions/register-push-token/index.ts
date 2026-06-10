// Phase O.2 — register the calling user's Expo push token.
//
// Body : { token: string, platform: 'ios' | 'android', device_label?: string }
// Response : { registered: true }
//
// Auth : requireUser.
//
// Upsert on token : a push token identifies a DEVICE, not a user. When a
// different account signs in on the same device the row is reassigned to the
// new user — otherwise the previous owner would keep receiving the new
// owner's pushes. Called on every app start while signed in, so updated_at
// doubles as a liveness marker.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  token: string;
  platform: 'ios' | 'android';
  device_label?: string;
}

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.token !== 'string' || x.token.length > 200 || !EXPO_TOKEN_RE.test(x.token)) return false;
  if (x.platform !== 'ios' && x.platform !== 'android') return false;
  if (x.device_label !== undefined && (typeof x.device_label !== 'string' || x.device_label.length > 80)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/push/register-token', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error } = await sb.from('push_tokens').upsert(
    {
      user_id: userId,
      token: body.token,
      platform: body.platform,
      device_label: body.device_label ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
  if (error) {
    console.error('[register-push-token] upsert error:', error);
    throwApi('INTERNAL_ERROR', 500, "Erreur lors de l'enregistrement de l'appareil.");
  }

  return { body: { registered: true } };
}));
