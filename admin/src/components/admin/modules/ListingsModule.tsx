'use client';

// Final sprint §2 — listings moderation on real data (was mock-only).
// Takedown requires confirmation (+ optional reason sent to the seller by
// push) ; approve re-lists pending / paused / removed listings. V1 payout of
// moderation is binary — no flag counts or shadow-ban nuance yet.

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { EyeOff, RotateCcw, Loader2, X, ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import {
  useAdminListings,
  useModerateListing,
  type AdminListing,
} from '@/data/queries/listings';

const STATUS_META: Record<AdminListing['status'], { label: string; cls: string }> = {
  active: { label: 'En ligne', cls: 'bg-success/12 text-success' },
  pending: { label: 'En attente', cls: 'bg-accent-soft text-accent-text' },
  paused: { label: 'Pause', cls: 'bg-sunken text-muted' },
  reserved: { label: 'Réservée', cls: 'bg-accent-soft text-accent-text' },
  sold: { label: 'Vendue', cls: 'bg-sunken text-muted' },
  removed: { label: 'Retirée', cls: 'bg-danger/12 text-danger' },
};

const KYC_BADGE: Record<string, string> = {
  approved: '✓ vérifié',
  pending: 'kyc en cours',
  in_review: 'kyc en cours',
  declined: 'kyc refusé',
  none: '—',
};

export function ListingsModule() {
  const { data: listings, isLoading, isError } = useAdminListings();
  const moderate = useModerateListing();
  const [takedownTarget, setTakedownTarget] = useState<AdminListing | null>(null);
  const [reason, setReason] = useState('');

  const columns: ColumnDef<AdminListing>[] = [
    {
      accessorKey: 'title',
      header: 'Annonce',
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sunken text-[10px] font-bold uppercase text-muted">
              {l.kind === 'product' ? 'PR' : 'IM'}
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">{l.title}</div>
              <div className="text-xs text-muted">{l.category}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'owner',
      header: 'Vendeur',
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="text-sm font-semibold">
              {l.shop_name ?? l.owner?.display_name ?? '—'}
            </div>
            <div className="text-[11px] text-muted">
              {KYC_BADGE[l.owner?.kyc_status ?? 'none'] ?? '—'}
            </div>
          </div>
        );
      },
    },
    { accessorKey: 'city', header: 'Ville' },
    {
      accessorKey: 'price_minor',
      header: 'Prix',
      cell: ({ row }) => (
        <span className="font-bold tabular-nums">
          {row.original.price_minor.toLocaleString('fr-FR')} GNF
        </span>
      ),
    },
    {
      accessorKey: 'view_count',
      header: 'Vues',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted">
          {row.original.view_count.toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => {
        const m = STATUS_META[row.original.status];
        return (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
            {m.label}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const l = row.original;
        const canApprove = l.status === 'pending' || l.status === 'paused' || l.status === 'removed';
        return (
          <div className="flex items-center justify-end gap-1">
            {canApprove && (
              <button
                title="Remettre en ligne"
                disabled={moderate.isPending}
                onClick={() => moderate.mutate({ kind: l.kind, id: l.id, action: 'approve' })}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-success disabled:opacity-50"
              >
                <RotateCcw size={15} />
              </button>
            )}
            {l.status !== 'removed' && (
              <button
                title="Retirer (modération)"
                disabled={moderate.isPending}
                onClick={() => {
                  setReason('');
                  setTakedownTarget(l);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-danger disabled:opacity-50"
              >
                <EyeOff size={15} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des annonces…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
        Impossible de charger les annonces. Réessaie.
      </div>
    );
  }

  return (
    <>
      <DataTable<AdminListing, unknown>
        data={listings ?? []}
        columns={columns}
        searchKey="title"
        searchPlaceholder="Rechercher une annonce…"
      />

      {/* Takedown confirmation */}
      {takedownTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)]">
            <div className="font-display text-lg font-bold">Retirer cette annonce ?</div>
            <p className="mt-2 text-sm text-muted">
              « {takedownTarget.title} » ne sera plus visible. Le vendeur reçoit une notification
              et ne peut pas remettre l&apos;annonce en ligne lui-même.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Motif (optionnel, envoyé au vendeur)…"
              className="mt-4 w-full resize-none rounded-xl border border-line bg-sunken/40 p-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setTakedownTarget(null)}
                disabled={moderate.isPending}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  moderate.mutate(
                    {
                      kind: takedownTarget.kind,
                      id: takedownTarget.id,
                      action: 'takedown',
                      ...(reason.trim() ? { reason: reason.trim() } : {}),
                    },
                    { onSuccess: () => setTakedownTarget(null) },
                  )
                }
                disabled={moderate.isPending}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                style={{ flex: '1.5 1 0' }}
              >
                {moderate.isPending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                Retirer l&apos;annonce
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-faint">
              <ShieldCheck size={12} />
              Décision tracée dans l&apos;audit admin.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
