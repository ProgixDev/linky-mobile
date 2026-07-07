// Listing comments — public read (list-comments) + authed writes (post-comment,
// toggle-comment-like). Comments are a tree: top-level newest-first, each with
// a `replies` array (oldest-first). apiPost defaults authed:true; the list is a
// public read (authed:false) but still forwards the bearer if present so the
// server can compute likedByMe.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Comment } from '../types';

export type CommentKind = 'product' | 'property';

type Key = ['listing-comments', CommentKind, string | undefined];

export function useListingComments(kind: CommentKind, listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-comments', kind, listingId] as Key,
    enabled: !!listingId,
    queryFn: async (): Promise<Comment[]> => {
      // authed:true forwards the user token WHEN present so the server computes
      // likedByMe; list-comments uses optional auth (never throws), so a
      // logged-out caller sends the anon key and still gets the public list
      // with likedByMe:false. No 401 risk — the endpoint never requires auth.
      const { comments } = await apiPost<{ comments: Comment[] }>({
        path: '/list-comments',
        body: { listing_kind: kind, listing_id: listingId },
      });
      return comments;
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: CommentKind; listingId: string; body: string; parentId?: string }) => {
      const { comment } = await apiPost<{ comment: Comment }>({
        path: '/post-comment',
        body: {
          listing_kind: input.kind,
          listing_id: input.listingId,
          body: input.body,
          ...(input.parentId ? { parent_id: input.parentId } : {}),
        },
      });
      return comment;
    },
    onSuccess: (comment, { kind, listingId, parentId }) => {
      qc.setQueryData<Comment[] | undefined>(['listing-comments', kind, listingId] as Key, (prev) => {
        if (!prev) return parentId ? prev : [comment];
        if (parentId) {
          // Append the reply under its parent (oldest-first).
          return prev.map((c) =>
            c.id === parentId ? { ...c, replies: [...(c.replies ?? []), comment] } : c,
          );
        }
        // Prepend the new top-level comment.
        return [comment, ...prev];
      });
      qc.invalidateQueries({ queryKey: ['listing-comments', kind, listingId] });
    },
  });
}

export function useToggleCommentLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: CommentKind; listingId: string; commentId: string }) => {
      const res = await apiPost<{ liked: boolean; likeCount: number }>({
        path: '/toggle-comment-like',
        body: { comment_id: input.commentId },
      });
      return res;
    },
    // Optimistic flip on the exact comment (top-level or reply).
    onMutate: async ({ kind, listingId, commentId }) => {
      const key = ['listing-comments', kind, listingId] as Key;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Comment[]>(key);
      const flip = (c: Comment): Comment =>
        c.id === commentId
          ? { ...c, likedByMe: !c.likedByMe, likeCount: c.likeCount + (c.likedByMe ? -1 : 1) }
          : c;
      qc.setQueryData<Comment[] | undefined>(key, (list) =>
        list?.map((c) => ({ ...flip(c), replies: c.replies?.map(flip) })),
      );
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    // Reconcile the exact count with the server truth.
    onSuccess: (res, { kind, listingId, commentId }) => {
      const key = ['listing-comments', kind, listingId] as Key;
      const apply = (c: Comment): Comment =>
        c.id === commentId ? { ...c, likedByMe: res.liked, likeCount: res.likeCount } : c;
      qc.setQueryData<Comment[] | undefined>(key, (list) =>
        list?.map((c) => ({ ...apply(c), replies: c.replies?.map(apply) })),
      );
    },
  });
}
