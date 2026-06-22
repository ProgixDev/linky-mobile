import { supabase } from '@/shared/lib/supabase';

import { CommentSchema, type Comment } from '../model/comment';

const PAGE = 30;
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** A page of comments for an entity, oldest first, cursor-paginated by created_at. */
export async function listComments(
  entityType: string,
  entityId: string,
  cursor?: string,
): Promise<Result<{ comments: Comment[]; nextCursor: string | null }>> {
  let query = supabase
    .from('comments')
    .select('id, entity_type, entity_id, user_id, parent_id, body, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
    .limit(PAGE);
  if (cursor) query = query.gt('created_at', cursor);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  const comments = (data ?? []).map((c) => CommentSchema.parse(c));
  const nextCursor = comments.length === PAGE ? comments[comments.length - 1]!.created_at : null;
  return { ok: true, value: { comments, nextCursor } };
}

/** Post a comment (or reply if parentId is set). RLS: only as yourself. */
export async function addComment(
  entityType: string,
  entityId: string,
  body: string,
  parentId?: string | null,
): Promise<Result<Comment>> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ entity_type: entityType, entity_id: entityId, body, parent_id: parentId ?? null })
    .select('id, entity_type, entity_id, user_id, parent_id, body, created_at')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not post comment.' };
  return { ok: true, value: CommentSchema.parse(data) };
}

/** Delete your own comment (RLS enforces ownership). */
export async function deleteComment(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true, value: true };
}
