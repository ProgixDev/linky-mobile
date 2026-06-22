import { useCallback, useEffect, useState } from 'react';

import { addComment, deleteComment, listComments } from './data/comments-repo';
import { NewCommentSchema, type Comment } from './model/comment';

/**
 * A comment thread for one entity: paginated load-more, optimistic add, delete.
 * The optimistic comment is reconciled with the server row (real id) on success
 * and rolled back on failure.
 */
export function useComments(entityType: string, entityId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reset = false) => {
    const r = await listComments(entityType, entityId, reset ? undefined : (cursor ?? undefined));
    if (!r.ok) {
      setError(r.error);
      setLoading(false);
      return;
    }
    setComments((prev) => (reset ? r.value.comments : [...prev, ...r.value.comments]));
    setCursor(r.value.nextCursor);
    setLoading(false);
  }, [entityType, entityId, cursor]);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const post = async (body: string, parentId?: string | null) => {
    const parsed = NewCommentSchema.safeParse({ body, parentId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    setError(null);
    const tempId = `temp_${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      entity_type: entityType,
      entity_id: entityId,
      user_id: 'me',
      parent_id: parentId ?? null,
      body: parsed.data.body,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);

    const r = await addComment(entityType, entityId, parsed.data.body, parentId);
    if (r.ok) {
      setComments((prev) => prev.map((c) => (c.id === tempId ? r.value : c)));
    } else {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setError(r.error);
    }
  };

  const remove = async (id: string) => {
    const prev = comments;
    setComments((cs) => cs.filter((c) => c.id !== id));
    const r = await deleteComment(id);
    if (!r.ok) setComments(prev);
  };

  return { comments, loading, error, hasMore: cursor != null, loadMore: () => load(false), post, remove };
}
