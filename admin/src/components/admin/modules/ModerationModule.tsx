'use client';

// Moderation console (2026-07-11): two feeds — listing comments and shop
// reviews — each with an admin delete. Deleting a comment cascades its replies
// + likes; deleting a review recomputes the shop's rating.
import { useState } from 'react';
import { Check, Flag, Loader2, MessageSquare, Star, Trash2, X } from 'lucide-react';
import {
  useAdminComments,
  useAdminReports,
  useAdminReviews,
  useDeleteComment,
  useDeleteReview,
  useResolveReport,
  type AdminReport,
  type ReportStatus,
} from '@/data/queries/moderation';

type Tab = 'reports' | 'comments' | 'reviews';

/** Ce que le signaleur a reproché. */
const REASON_LABEL: Record<AdminReport['reason'], string> = {
  scam: 'Arnaque',
  illegal: 'Interdit',
  offensive: 'Offensant',
  spam: 'Spam',
  wrong_info: 'Trompeur',
  other: 'Autre',
};

/** Le type de contenu visé. */
const KIND_LABEL: Record<AdminReport['targetKind'], string> = {
  product: 'Article',
  property: 'Bien',
  comment: 'Commentaire',
  review: 'Avis',
  user: 'Utilisateur',
};

function dateFR(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ModerationModule() {
  // « Signalements » PAR DÉFAUT, et en premier : c'est la seule des trois vues
  // qui demande une action. Les deux autres servent à parcourir.
  const [tab, setTab] = useState<Tab>('reports');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {([['reports', 'Signalements'], ['comments', 'Commentaires'], ['reviews', 'Avis']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
              tab === k ? 'bg-primary text-white' : 'bg-surface text-muted ring-1 ring-line hover:bg-sunken'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' ? <ReportsFeed /> : tab === 'comments' ? <CommentsFeed /> : <ReviewsFeed />}
    </div>
  );
}

/** Le sélecteur de statut de la file — trois pastilles discrètes. */
const STATUS_PILL = 'rounded-lg px-3 py-1 text-[11px] font-bold transition-colors';
const STATUS_PILL_ON = ' bg-sunken text-[#0E1311] ring-1 ring-line';
const STATUS_PILL_OFF = ' text-muted hover:text-[#0E1311]';

function ReportsFeed() {
  const [status, setStatus] = useState<ReportStatus>('pending');
  const { data, isLoading, isError } = useAdminReports(status);
  const resolve = useResolveReport();
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {([['pending', 'En attente'], ['actioned', 'Traités'], ['dismissed', 'Ignorés']] as [ReportStatus, string][]).map(
          ([k, label]) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              className={STATUS_PILL + (status === k ? STATUS_PILL_ON : STATUS_PILL_OFF)}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {isLoading ? (
        <Loading label="Chargement des signalements…" />
      ) : isError ? (
        <ErrorBox />
      ) : rows.length === 0 ? (
        <Empty label={status === 'pending' ? 'Aucun signalement en attente.' : 'Rien ici.'} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-danger/10">
                <Flag size={14} className="text-danger" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
                    {REASON_LABEL[r.reason]}
                  </span>
                  <span className="rounded bg-sunken px-1.5 py-0.5 text-[9px] font-bold uppercase">
                    {KIND_LABEL[r.targetKind]}
                  </span>
                  {/* Plusieurs personnes sur la même cible : c'est ce qui
                      distingue une rancune isolée d'un vrai problème. */}
                  {r.reportCount > 1 && (
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-text">
                      {r.reportCount} signalements
                    </span>
                  )}
                  <span>· {r.reporterName ?? 'Utilisateur Linky'}</span>
                  <span>· {dateFR(r.createdAt)}</span>
                </div>
                <p className="mt-1 break-words text-sm font-semibold text-[#0E1311]">
                  {/* Une cible nulle a déjà été supprimée — l'admin doit le voir
                      plutôt que de chercher un contenu qui n'existe plus. */}
                  {r.targetPreview ?? '(contenu supprimé)'}
                </p>
                {r.details && <p className="mt-0.5 break-words text-xs italic text-muted">« {r.details} »</p>}
                {r.status !== 'pending' && (
                  <p className="mt-1 text-[11px] text-muted">
                    {r.status === 'actioned' ? 'Traité' : 'Ignoré'}
                    {r.reviewedByName ? ' par ' + r.reviewedByName : ''}
                    {r.reviewedAt ? ' · ' + dateFR(r.reviewedAt) : ''}
                    {r.adminNote ? ' — ' + r.adminNote : ''}
                  </p>
                )}
              </div>
              {r.status === 'pending' && (
                <div className="flex shrink-0 gap-1.5">
                  {/* LA SUPPRESSION RESTE AILLEURS (onglets Commentaires et
                      Avis) : clore un signalement et retirer un contenu sont
                      deux décisions. On garde le cas « limite, on laisse ». */}
                  <button
                    onClick={() => resolve.mutate({ report_id: r.id, decision: 'actioned' })}
                    disabled={resolve.isPending}
                    title="Marquer traité"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25 hover:bg-primary/15 disabled:opacity-50"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => resolve.mutate({ report_id: r.id, decision: 'dismissed' })}
                    disabled={resolve.isPending}
                    title="Ignorer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-muted ring-1 ring-line hover:bg-line disabled:opacity-50"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentsFeed() {
  const { data, isLoading, isError } = useAdminComments();
  const del = useDeleteComment();
  const rows = data ?? [];

  if (isLoading) return <Loading label="Chargement des commentaires…" />;
  if (isError) return <ErrorBox />;
  if (rows.length === 0) return <Empty label="Aucun commentaire." />;

  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-sunken">
            <MessageSquare size={14} className="text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="font-bold text-[#0E1311]">{c.authorName ?? 'Utilisateur Linky'}</span>
              {c.isReply && <span className="rounded bg-sunken px-1.5 py-0.5 text-[9px] font-bold uppercase">réponse</span>}
              <span>· {dateFR(c.createdAt)}</span>
              {c.listingTitle && <span>· sur « {c.listingTitle} »</span>}
            </div>
            <p className="mt-1 break-words text-sm text-[#0E1311]">{c.body}</p>
          </div>
          <DeleteBtn
            // Only the row being deleted disables — the shared mutation's
            // `variables` tells us which id is in flight.
            pending={del.isPending && del.variables?.comment_id === c.id}
            onClick={() => {
              if (!window.confirm('Supprimer ce commentaire ? Ses réponses et likes seront aussi supprimés.')) return;
              del.mutate({ comment_id: c.id });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ReviewsFeed() {
  const { data, isLoading, isError } = useAdminReviews();
  const del = useDeleteReview();
  const rows = data ?? [];

  if (isLoading) return <Loading label="Chargement des avis…" />;
  if (isError) return <ErrorBox />;
  if (rows.length === 0) return <Empty label="Aucun avis." />;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
            <Star size={14} className="text-accent-text" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span className="font-bold text-[#0E1311]">{r.reviewerName ?? 'Client Linky'}</span>
              <span className="font-bold text-accent-text tabular-nums">{r.rating}/5</span>
              <span>· {dateFR(r.createdAt)}</span>
              {r.shopName && <span>· sur « {r.shopName} »</span>}
            </div>
            {r.comment && <p className="mt-1 break-words text-sm text-[#0E1311]">{r.comment}</p>}
          </div>
          <DeleteBtn
            // Only the row being deleted disables (see CommentsFeed note).
            pending={del.isPending && del.variables?.review_id === r.id}
            onClick={() => {
              if (!window.confirm('Supprimer cet avis ? La note de la boutique sera recalculée.')) return;
              del.mutate({ review_id: r.id });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function DeleteBtn({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title="Supprimer"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger ring-1 ring-danger/25 hover:bg-danger/15 disabled:opacity-50"
    >
      <Trash2 size={14} />
    </button>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
      <Loader2 size={16} className="mr-2 animate-spin" /> {label}
    </div>
  );
}
function ErrorBox() {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
      Impossible de charger. Réessaie.
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
      {label}
    </div>
  );
}
