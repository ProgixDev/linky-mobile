import { supabase } from '@/shared/lib/supabase';

import {
  ProfileSchema,
  ProfileUpdateSchema,
  type Profile,
  type ProfileUpdate,
} from '../model/profile';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The current user's profile (RLS: own row only). */
export async function getMyProfile(): Promise<Result<Profile | null>> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };
  const { data, error } = await supabase.from('profiles').select('*').eq('id', me.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: data ? ProfileSchema.parse(data) : null };
}

/** Update the current user's profile. Validated at the edge; RLS enforces ownership. */
export async function updateProfile(update: ProfileUpdate): Promise<Result<Profile>> {
  const parsed = ProfileUpdateSchema.safeParse(update);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid profile.' };
  }
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };
  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', me.id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: ProfileSchema.parse(data) };
}
