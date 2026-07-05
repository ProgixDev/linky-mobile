// Listing comments — public read (list-comments) + authed write (post-comment).
// Mirrors the reviews query shape. Comments hang off a product OR property via
// (kind, id). apiPost defaults authed:true; the list is a public read so it
// passes authed:false (matches the discover feed).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Comment } from '../types';

export type CommentKind = 'product' | 'property';

export function useListingComments(kind: CommentKind, listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-comments', kind, listingId],
    enabled: !!listingId,
    queryFn: async (): Promise<Comment[]> => {
      const { comments } = await apiPost<{ comments: Comment[] }>({
        path: '/list-comments',
        authed: false,
        body: { listing_kind: kind, listing_id: listingId },
      });
      return comments;
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: CommentKind; listingId: string; body: string }) => {
      const { comment } = await apiPost<{ comment: Comment }>({
        path: '/post-comment',
        body: { listing_kind: input.kind, listing_id: input.listingId, body: input.body },
      });
      return comment;
    },
    onSuccess: (comment, { kind, listingId }) => {
      // Prepend to the cached list so the new comment shows instantly, then
      // invalidate to reconcile with the server order.
      qc.setQueryData<Comment[] | undefined>(['listing-comments', kind, listingId], (prev) =>
        prev ? [comment, ...prev] : [comment],
      );
      qc.invalidateQueries({ queryKey: ['listing-comments', kind, listingId] });
    },
  });
}
