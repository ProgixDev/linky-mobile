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

// ===========================================================================
// SIGNALEMENTS (2026-09-26) — la file que les utilisateurs alimentent.
// ===========================================================================
// Jusqu'ici la console pouvait SUPPRIMER un commentaire ou un avis, mais rien
// ne lui disait lequel poser problème : il fallait tomber dessus en faisant
// défiler. Les deux flux ci-dessus restent utiles pour parcourir, celui-ci dit
// où regarder. C'est aussi ce que la politique Google Play sur le contenu généré
// par les utilisateurs attend : un signalement qui aboutit à une décision.

export type ReportStatus = 'pending' | 'actioned' | 'dismissed';

export interface AdminReport {
  id: string;
  targetKind: 'product' | 'property' | 'comment' | 'review' | 'user';
  targetId: string;
  /** null = la cible n'existe plus, elle a déjà été supprimée. */
  targetPreview: string | null;
  /** Combien de personnes ont signalé la même cible, tous statuts confondus. */
  reportCount: number;
  reporterId: string;
  reporterName: string | null;
  reason: 'spam' | 'illegal' | 'offensive' | 'scam' | 'wrong_info' | 'other';
  details: string | null;
  status: ReportStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  adminNote: string | null;
  createdAt: string;
}

export function useAdminReports(status: ReportStatus) {
  return useQuery({
    queryKey: ['admin-reports', status],
    queryFn: async () => {
      const r = await apiFetch<{ reports: AdminReport[] }>('admin-list-reports', { status });
      if (!r.ok || !r.data) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      return r.data.reports;
    },
    refetchInterval: 60_000,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { report_id: string; decision: 'actioned' | 'dismissed'; note?: string }) => {
      const r = await apiFetch<{ report_id: string; status: string }>('admin-resolve-report', input);
      if (!r.ok) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur' };
      return r.data;
    },
    onSuccess: (_d, v) => {
      // Les trois listes bougent d'un coup : la ligne quitte « En attente » et
      // rejoint l'un des deux autres onglets.
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success(v.decision === 'actioned' ? 'Signalement marqué traité.' : 'Signalement ignoré.');
    },
    onError: (err: unknown) => {
      const e = err as { message_fr?: string };
      toast.error(e.message_fr ?? 'Erreur.');
    },
  });
}
