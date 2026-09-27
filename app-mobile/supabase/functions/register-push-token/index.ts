// Phase O.2 — register the calling user's Expo push token.
//
// Body : { token: string, platform: 'ios' | 'android', device_label?: string,
//          app?: 'marketplace' | 'driver' }
// Response : { registered: true }
//
// Auth : requireUser.
//
// Upsert on token : a push token identifies a DEVICE, not a user. When a
// different account signs in on the same device the row is reassigned to the
// new user — otherwise the previous owner would keep receiving the new
// owner's pushes. Called on every app start while signed in, so updated_at
// doubles as a liveness marker.
//
// `app` (push_tokens.app) records which Linky app the device belongs to so
// notify() can target one app. Defaults to 'marketplace' when omitted (the
// marketplace app does not send it). The driver app sends app:'driver'.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type AppKind = 'marketplace' | 'driver';

interface Body {
  token: string;
  platform: 'ios' | 'android';
  device_label?: string;
  app?: AppKind;
  /**
   * La version du jeu de canaux de notification que CE bundle a creee au
   * demarrage (notifyKinds.ts -> CHANNELS_VERSION). Absente = bundle anterieur
   * aux canaux nommes : le serveur n'enverra alors aucun channelId, parce que
   * nommer un canal absent de l'appareil rend la notification INVISIBLE.
   */
  channels_v?: number;
}

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.token !== 'string' || x.token.length > 200 || !EXPO_TOKEN_RE.test(x.token)) return false;
  if (x.platform !== 'ios' && x.platform !== 'android') return false;
  if (x.device_label !== undefined && (typeof x.device_label !== 'string' || x.device_label.length > 80)) return false;
  if (x.app !== undefined && x.app !== 'marketplace' && x.app !== 'driver') return false;
  if (x.channels_v !== undefined) {
    if (typeof x.channels_v !== 'number' || !Number.isInteger(x.channels_v)) return false;
    if (x.channels_v < 0 || x.channels_v > 1000) return false;
  }
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
      app: body.app ?? 'marketplace',
      // Ecrit a CHAQUE demarrage : c'est ce qui fait remonter un appareil de 0 a 1
      // des qu'il prend la mise a jour, sans rattrapage a faire en base.
      channels_v: body.channels_v ?? 0,
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
