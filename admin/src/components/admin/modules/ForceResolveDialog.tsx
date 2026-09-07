'use client';

// Débloquer une commande dont l'acheteur ne répond plus.
//
// POURQUOI CET ÉCRAN EXISTE. resolve-dispute exige le statut 'disputed', et
// rien ne permet de mettre une commande en litige à la place de l'acheteur.
// Une commande payée dont l'acheteur se tait n'avait donc AUCUNE issue : ni
// pour lui, ni pour le vendeur, ni pour un administrateur. L'argent restait au
// séquestre indéfiniment. Trois commandes étaient dans cet état le 2026-09-07.
//
// C'est aussi le recours des cas que le balayage automatique écarte exprès :
// montant au-dessus du plafond, livraison déjà engagée, solde de séquestre
// incohérent, acheteur déjà remboursé plusieurs fois. Le balayage automatise
// le cas évident ; cet écran traite tout le reste — et c'est lui qui rend la
// prudence du balayage tenable.
//
// DEUX DIFFÉRENCES ASSUMÉES AVEC ConfirmResolveDialog :
//   1. Le motif est OBLIGATOIRE. Un litige porte déjà sa propre trace :
//      l'acheteur a expliqué pourquoi il contestait. Ce geste-ci n'en a
//      aucune. Le serveur le refuse aussi (reason_required) ; on le dit ici
//      pour que l'admin le voie avant de cliquer, pas après.
//   2. Le remboursement est proposé PAR DÉFAUT. Le silence d'un acheteur
//      n'est pas une preuve de réception : libérer à tort lui coûte la
//      marchandise ET l'argent, rembourser à tort coûte une vente au vendeur,
//      qui peut la refaire. Le défaut penche du côté réparable.

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useForceResolveOrder, type AdminOrder } from '@/data/queries/orders-admin';

// Vocabulaire fermé, comme pour les litiges : un motif choisi dans une liste
// s'agrège dans un rapport, du texte libre non. « Autre » reste la porte de
// sortie, et impose alors la précision.
const REASONS = [
  "Acheteur injoignable — commande bloquée",
  'Acheteur a confirmé la réception hors application',
  'Livraison prouvée par le vendeur',
  'Marchandise jamais remise',
  'Autre',
] as const;

const OTHER = 'Autre';

export function ForceResolveDialog({
  order,
  onClose,
}: {
  order: AdminOrder;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<'refund' | 'release'>('refund');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [detail, setDetail] = useState('');
  const mutation = useForceResolveOrder();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mutation.isPending, onClose]);

  // « Autre » sans précision ne dit rien de plus que rien du tout.
  const needsDetail = reason === OTHER;
  const finalReason = needsDetail ? detail.trim() : reason;
  const canSubmit = finalReason.length >= 3 && !mutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { order_id: order.id, outcome, reason: finalReason.slice(0, 500) },
      { onSuccess: onClose },
    );
  };

  const buyerLabel = order.buyer?.display_name ?? order.buyer?.id.slice(0, 8) ?? '—';
  const sellerLabel = order.seller?.display_name ?? order.seller?.id.slice(0, 8) ?? '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-resolve-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="force-resolve-title" className="font-display text-lg font-bold tracking-tight">
              Débloquer la commande
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-bold tabular-nums">{order.reference}</span>
              <span>·</span>
              <span className="tabular-nums">
                {Number(order.total_minor).toLocaleString('fr-FR')} GNF
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {buyerLabel} <span className="text-faint">→</span> {sellerLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="rounded-md p-1 text-muted hover:bg-sunken disabled:opacity-50"
            aria-label="Fermer"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* L'argent bouge pour de bon et ne se rejoue pas. Le dire ici, à
              l'endroit du geste, vaut mieux que de compter sur la mémoire. */}
          <div className="flex gap-2.5 rounded-xl bg-danger/8 p-3 text-xs text-danger">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            <span>
              L&apos;argent quitte le séquestre immédiatement. Cette action est définitive et
              enregistrée à ton nom.
            </span>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-faint">Décision</div>
            <div className="mt-2 grid gap-2">
              {(['refund', 'release'] as const).map((o) => {
                const active = outcome === o;
                return (
                  <label
                    key={o}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                      active ? 'border-primary bg-primary-soft' : 'border-line bg-sunken/40 hover:bg-sunken'
                    }`}
                  >
                    <input
                      type="radio"
                      name="force-outcome"
                      value={o}
                      checked={active}
                      onChange={() => setOutcome(o)}
                      className="mt-1 h-3 w-3"
                    />
                    <span>
                      <span className="font-bold">
                        {o === 'refund' ? "Rembourser l'acheteur" : 'Libérer au vendeur'}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {o === 'refund'
                          ? 'Prix, frais de service et de livraison rendus. Le stock repart en ligne.'
                          : "Le vendeur reçoit le prix, la plateforme ses frais. À ne choisir qu'avec une preuve de remise."}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider text-faint"
              htmlFor="force-reason"
            >
              Motif (obligatoire)
            </label>
            <select
              id="force-reason"
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

          {needsDetail && (
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-faint"
                htmlFor="force-detail"
              >
                Précise
              </label>
              <textarea
                id="force-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                autoFocus
                placeholder="Ce que tu écris ici est ce qu'on lira dans six mois…"
                className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm"
              />
              <div className="mt-1 text-right text-[11px] text-faint">{detail.length} / 500</div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            type="button"
            className="rounded-xl bg-sunken px-4 py-2.5 text-sm font-bold hover:bg-line disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            type="button"
            className="flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {outcome === 'refund' ? 'Rembourser' : 'Libérer'}
          </button>
        </div>
      </div>
    </div>
  );
}
