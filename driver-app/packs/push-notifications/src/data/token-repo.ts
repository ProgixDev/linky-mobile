import { supabase } from '@/shared/lib/supabase';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Upsert this device's push token for the current user (RLS: own rows only).
 * Unique on `token`, so re-registering the same device updates instead of dupes.
 */
export async function saveDeviceToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: me.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Remove this device's token (call on sign-out so the user stops getting pushes). */
export async function removeDeviceToken(token: string): Promise<Result> {
  const { error } = await supabase.from('device_tokens').delete().eq('token', token);
  return error ? { ok: false, error: error.message } : { ok: true };
}
