import { supabase } from '@/shared/lib/supabase';

type Result = { ok: true } | { ok: false; error: string };

/** Follow a user (RLS: only as yourself). Idempotent via the primary key. */
export async function follow(targetUserId: string): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: me.id, following_id: targetUserId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Unfollow a user (RLS: only your own edge). */
export async function unfollow(targetUserId: string): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', me.id)
    .eq('following_id', targetUserId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Whether the current user follows the target. */
export async function isFollowing(targetUserId: string): Promise<boolean> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return false;
  const { count } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('follower_id', me.id)
    .eq('following_id', targetUserId);
  return (count ?? 0) > 0;
}

/** Follower + following counts for a user. */
export async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}
