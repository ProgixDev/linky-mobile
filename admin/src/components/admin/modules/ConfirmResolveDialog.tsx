'use client';

// Modal that confirms a dispute verdict before firing /resolve-dispute.
// Opened by DisputesKanban when an admin drags a card into the refunded or
// released column, or hits "Résoudre" in the detail drawer. Cancel reverts
// the drag in the parent (DisputesKanban clears pendingDrop on cancel).
//
// V1 motif vocabulary is closed (5 options): controlled-vocab is easier to
// aggregate for incident reporting than free text. "Autre" is the escape
// hatch — the note field carries the detail when "Autre" is selected.

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useResolveDispute, type DisputeListItem } from '@/data/queries/disputes';

const REASONS = [
  "Acheteur n'a pas reçu",
  'Article non conforme',
  'Acheteur a reconnu réception',
  'Vendeur a fourni preuve livraison',
  'Autre',
] as const;

export function ConfirmResolveDialog({
  item,
  outcome: initialOutcome,
  onCancel,
  onResolved,
}: {
  item: DisputeListItem;
  outcome: 'refund' | 'release';
  onCancel: () => void;
  onResolved: (outcome: 'refund' | 'release') => void;
}) {
  const [outcome, setOutcome] = useState<'refund' | 'release'>(initialOutcome);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState('');
  const mutation = useResolveDispute();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mutation.isPending, onCancel]);

  const submit = () => {
    mutation.mutate(
      {
        order_id: item.order.id,
        outcome,
        reason,
        note: note.trim() ? note.trim() : undefined,
      },
      { onSuccess: () => onResolved(outcome) },
    );
  };

  const buyerLabel = item.buyer.displayName ?? item.buyer.id.slice(0, 8);
  const sellerLabel = item.seller.displayName ?? item.seller.id.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-resolve-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="confirm-resolve-title" className="font-display text-lg font-bold tracking-tight">
              Confirmer la résolution
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-bold tabular-nums">{item.order.reference}</span>
              <span>·</span>
              <span className="tabular-nums">
                {(item.order.totalGnf / 1000).toLocaleString('fr-FR')} k GNF
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {buyerLabel} <span className="text-faint">vs</span> {sellerLabel}
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={mutation.isPending}
            className="rounded-md p-1 text-muted hover:bg-sunken disabled:opacity-50"
            aria-label="Fermer"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-faint">Verdict</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['refund', 'release'] as const).map((o) => {
                const active = outcome === o;
                return (
                  <label
                    key={o}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold transition-colors ${
                      active ? 'border-primary bg-primary-soft' : 'border-line bg-sunken/40 hover:bg-sunken'
                    }`}
                  >
                    <input
                      type="radio"
                      name="outcome"
                      value={o}
                      checked={active}
                      onChange={() => setOutcome(o)}
                      className="h-3 w-3"
                    />
                    {o === 'refund' ? 'Rembourser acheteur' : 'Libérer vendeur'}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider text-faint"
              htmlFor="resolve-reason"
            >
              Motif
            </label>
            <select
              id="resolve-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider text-faint"
              htmlFor="resolve-note"
            >
              Note (optionnel)
            </label>
            <textarea
              id="resolve-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder="Contexte additionnel pour l'audit…"
              className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm"
            />
            <div className="mt-1 text-right text-[11px] text-faint">{note.length} / 500</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onCancel}
            disabled={mutation.isPending}
            type="button"
            className="rounded-xl bg-sunken px-4 py-2.5 text-sm font-bold hover:bg-line disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={mutation.isPending}
            type="button"
            className="flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Confirmer le verdict
          </button>
        </div>
      </div>
    </div>
  );
}
