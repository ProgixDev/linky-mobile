'use client';

// Moderation hooks (2026-07-11): recent comments + reviews across the
// marketplace, with admin delete. Closes the gap where abusive UGC could only
// be removed via raw SQL.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface AdminComment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  listingKind: 'product' | 'property';
  listingId: string;
  listingTitle: string | null;
  isReply: boolean;
}

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerId: string;
  reviewerName: string | null;
  shopId: string;
  shopName: string | null;
}

export function useAdminComments() {
  return useQuery({
    queryKey: ['admin-comments'],
    queryFn: async () => {
      const r = await apiFetch<{ comments: AdminComment[] }>('admin-list-comments', {});
      if (!r.ok || !r.data) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      return r.data.comments;
    },
    refetchInterval: 60_000,
  });
}

export function useAdminReviews() {
  return useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const r = await apiFetch<{ reviews: AdminReview[] }>('admin-list-reviews', {});
      if (!r.ok || !r.data) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      return r.data.reviews;
    },
    refetchInterval: 60_000,
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { comment_id: string; reason?: string }) => {
      const r = await apiFetch<{ ok: true }>('admin-delete-comment', input);
      if (!r.ok) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur' };
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-comments'] });
      toast.success('Commentaire supprimé.');
    },
    onError: (err: unknown) => {
      const e = err as { message_fr?: string };
      toast.error(e.message_fr ?? 'Erreur de suppression.');
    },
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { review_id: string; reason?: string }) => {
      const r = await apiFetch<{ ok: true }>('admin-delete-review', input);
      if (!r.ok) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur' };
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      toast.success('Avis supprimé. Note de la boutique recalculée.');
    },
    onError: (err: unknown) => {
      const e = err as { message_fr?: string };
      toast.error(e.message_fr ?? 'Erreur de suppression.');
    },
  });
}
