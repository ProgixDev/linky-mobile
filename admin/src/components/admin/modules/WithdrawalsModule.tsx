'use client';

// Phase S — withdrawals processing queue (mirror of the KYC module layout :
// pending queue left, detail pane right).
//
// V1 payout is MANUAL : the admin sends the mobile-money transfer outside the
// app, then marks the request paid — which debits the seller's wallet at that
// moment (funds are NOT held at request time). The detail pane therefore shows
// the seller's CURRENT balance next to the requested amount, with a red flag
// when the balance no longer covers the request.

import { useState } from 'react';
import { Banknote, X, Calendar, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useWithdrawals, useProcessWithdrawal, type WithdrawalRow } from '@/data/queries/withdrawals';

function initialsOf(name: string | null | undefined): string {
  return (name ?? 'Vendeur')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function gnf(n: number): string {
  return `${n.toLocaleString('fr-FR')} GNF`;
}

// Mask any long digit run in the destination (e.g. "+224622551288" →
// "+224 622 •• 12 88" -ish) so full payout numbers aren't exposed on an
// always-on dashboard. The admin sees enough to recognize the account.
function maskDestination(dest: string): string {
  return dest.replace(/(\+?\d{6})\d{3,}(\d{2})/g, '$1•••$2');
}

export function WithdrawalsModule() {
  const { data: withdrawals, isLoading, isError } = useWithdrawals('pending');
  const [activeId, setActiveId] = useState<string | null>(null);

  const pending = withdrawals ?? [];
  const active = pending.find((w) => w.id === activeId) ?? pending[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted lg:h-[calc(100vh-220px)]">
        <Loader2 size={16} className="mr-2 animate-spin" /> Chargement de la file…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger lg:h-[calc(100vh-220px)]">
        Impossible de charger les retraits. Réessaie.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:h-[calc(100vh-220px)] lg:grid-cols-[420px_1fr]">
      {/* Queue */}
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4 lg:max-h-none">
        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-bold">Demandes en attente</div>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent-text">
            {pending.length}
          </span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {pending.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Aucun retrait en attente 🎉
            </div>
          ) : (
            pending.map((w) => {
              const isActive = active?.id === w.id;
              const short = (w.balance_minor ?? 0) < w.amount_minor;
              return (
                <button
                  key={w.id}
                  onClick={() => setActiveId(w.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary-soft'
                      : 'border-line bg-sunken/40 hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-xs font-bold">
                      {initialsOf(w.users?.display_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {w.users?.display_name ?? 'Vendeur Linky'}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(w.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">{gnf(w.amount_minor)}</div>
                      {short && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-bold uppercase text-danger">
                          <AlertTriangle size={10} /> solde insuffisant
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail pane */}
      {active ? (
        <DetailPane key={active.id} request={active} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
          Sélectionne une demande à gauche.
        </div>
      )}
    </div>
  );
}

function DetailPane({ request }: { request: WithdrawalRow }) {
  const process = useProcessWithdrawal();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const name = request.users?.display_name ?? 'Vendeur Linky';
  const balance = request.balance_minor ?? 0;
  const short = balance < request.amount_minor;

  return (
    <div className="flex flex-col gap-5 overflow-y-auto">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-base font-bold">
            {initialsOf(request.users?.display_name)}
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-sunken px-2 py-0.5 font-bold uppercase tracking-wider">
                EN ATTENTE
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {new Date(request.created_at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold tabular-nums">
              {gnf(request.amount_minor)}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-faint">
              montant demandé
            </div>
          </div>
        </div>
      </div>

      {/* Request details */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-faint">Détails</div>
        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Destination</span>
            <span className="font-semibold">
              {request.destination ? maskDestination(request.destination) : '— non précisée —'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Solde actuel du vendeur</span>
            <span className={`font-bold tabular-nums ${short ? 'text-danger' : ''}`}>
              {gnf(balance)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Montant demandé</span>
            <span className="font-bold tabular-nums">{gnf(request.amount_minor)}</span>
          </div>
        </div>
        {short && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-xs font-semibold text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Le solde ne couvre plus ce montant — le vendeur a dépensé depuis la demande. « Marquer
            payé » sera refusé ; rejette avec un motif.
          </div>
        )}
        <div className="mt-4 text-xs text-faint">
          Le paiement est <span className="font-bold">manuel</span> : envoie d&apos;abord le transfert
          mobile money vers le compte du vendeur, puis marque la demande payée — son portefeuille
          Linky est débité à ce moment-là.
        </div>
      </div>

      {/* Reject reason */}
      {rejecting && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            Motif du rejet (envoyé au vendeur)
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ex. : numéro de compte invalide, demande en doublon…"
            className="mt-3 w-full resize-none rounded-xl border border-line bg-sunken/40 p-3 text-sm outline-none focus:border-primary"
          />
        </div>
      )}

      {/* Decision bar */}
      <div className="sticky bottom-0 flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)]">
        {rejecting ? (
          <>
            <button
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
              disabled={process.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                process.mutate({ request_id: request.id, outcome: 'rejected', reason: reason.trim() })
              }
              disabled={process.isPending || reason.trim().length === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ flex: '1.5 1 0' }}
            >
              {process.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <X size={15} strokeWidth={2.25} />
              )}
              Confirmer le rejet
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setRejecting(true)}
              disabled={process.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger/10 text-sm font-bold text-danger ring-1 ring-danger/25 hover:bg-danger/15 disabled:opacity-50"
            >
              <X size={15} strokeWidth={2.25} />
              Rejeter
            </button>
            <button
              onClick={() => process.mutate({ request_id: request.id, outcome: 'paid' })}
              disabled={process.isPending || short}
              title={short ? 'Solde insuffisant — impossible de payer' : undefined}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ flex: '1.5 1 0' }}
            >
              {process.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} strokeWidth={2.25} />
              )}
              Marquer payé
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-faint">
        <Banknote size={13} />
        Chaque décision est tracée (audit admin) et notifie le vendeur par push.
      </div>
    </div>
  );
}
