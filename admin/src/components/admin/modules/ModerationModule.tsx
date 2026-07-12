'use client';

// Moderation console (2026-07-11): two feeds — listing comments and shop
// reviews — each with an admin delete. Deleting a comment cascades its replies
// + likes; deleting a review recomputes the shop's rating.
import { useState } from 'react';
import { Loader2, MessageSquare, Star, Trash2 } from 'lucide-react';
import {
  useAdminComments,
  useAdminReviews,
  useDeleteComment,
  useDeleteReview,
} from '@/data/queries/moderation';

type Tab = 'comments' | 'reviews';

function dateFR(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ModerationModule() {
  const [tab, setTab] = useState<Tab>('comments');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {([['comments', 'Commentaires'], ['reviews', 'Avis']] as [Tab, string][]).map(([k, label]) => (
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
      {tab === 'comments' ? <CommentsFeed /> : <ReviewsFeed />}
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
            pending={del.isPending}
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
            pending={del.isPending}
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
