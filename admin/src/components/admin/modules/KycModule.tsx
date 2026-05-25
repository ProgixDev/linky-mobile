'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, X, FileText, User, Calendar } from 'lucide-react';
import { kycData, type KycSubmission } from '@/data/mock';

export function KycModule() {
  const [items, setItems] = useState<KycSubmission[]>(kycData);
  const pending = items.filter((k) => k.status === 'pending');
  const [activeId, setActiveId] = useState<string | null>(pending[0]?.id ?? null);
  const active = items.find((k) => k.id === activeId);

  const decide = (id: string, decision: 'approved' | 'rejected') => {
    setItems((prev) => prev.map((k) => (k.id === id ? { ...k, status: decision } : k)));
    toast.success(
      decision === 'approved'
        ? 'KYC validé. Utilisateur notifié.'
        : 'KYC rejeté. Utilisateur notifié.',
    );
    const remaining = items.filter((k) => k.id !== id && k.status === 'pending');
    setActiveId(remaining[0]?.id ?? null);
  };

  return (
    <div className="grid h-[calc(100vh-220px)] gap-6 lg:grid-cols-[420px_1fr]">
      {/* Queue */}
      <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg-elev p-4">
        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-bold">File d&apos;attente</div>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent-text">
            {pending.length}
          </span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {pending.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              Tout est traité 🎉
            </div>
          ) : (
            pending.map((k) => {
              const isActive = activeId === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setActiveId(k.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-bg-sunken/40 hover:bg-bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elev text-xs font-bold">
                      {k.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{k.name}</div>
                      <div className="text-xs text-text-muted">{k.docType}</div>
                    </div>
                    <span className="rounded-full bg-bg-elev px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      {k.role}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Review pane */}
      {active ? (
        <ReviewPane k={active} onDecide={decide} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-bg-elev text-sm text-text-muted">
          Sélectionne une demande à gauche.
        </div>
      )}
    </div>
  );
}

function ReviewPane({
  k,
  onDecide,
}: {
  k: KycSubmission;
  onDecide: (id: string, decision: 'approved' | 'rejected') => void;
}) {
  return (
    <div className="flex flex-col gap-5 overflow-y-auto">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-bg-elev p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-sunken text-base font-bold">
            {k.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {k.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="rounded-full bg-bg-sunken px-2 py-0.5 font-bold uppercase tracking-wider">
                {k.role}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={11} /> {k.docType}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {new Date(k.submittedAt).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Docs grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <DocPanel title="Recto pièce" />
        <DocPanel title="Verso pièce" />
        <DocPanel title="Selfie de contrôle" />
      </div>

      {/* Data check */}
      <div className="rounded-2xl border border-border bg-bg-elev p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
          Vérifications automatiques
        </div>
        <div className="mt-3 space-y-2.5">
          {[
            { label: 'Photo claire et lisible', ok: true },
            { label: 'Visage correspond au selfie', ok: true },
            { label: 'Document non expiré', ok: true },
            { label: 'Nom cohérent avec le compte', ok: true },
            { label: 'Pas de doublon détecté', ok: true },
          ].map((c) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15">
                <ShieldCheck size={11} className="text-success" strokeWidth={3} />
              </div>
              <span className="text-sm">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Decision bar */}
      <div className="sticky bottom-0 flex gap-3 rounded-2xl border border-border bg-bg-elev p-4 shadow-[var(--shadow-pop)]">
        <button
          onClick={() => onDecide(k.id, 'rejected')}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger/10 text-sm font-bold text-danger ring-1 ring-danger/25 hover:bg-danger/15"
        >
          <X size={15} strokeWidth={2.25} />
          Rejeter
        </button>
        <button
          onClick={() => onDecide(k.id, 'approved')}
          className="flex h-12 flex-1.5 items-center justify-center gap-2 rounded-xl bg-text text-sm font-bold text-bg hover:opacity-90"
          style={{ flex: '1.5 1 0' }}
        >
          <ShieldCheck size={15} strokeWidth={2.25} />
          Valider la vérification
        </button>
      </div>
    </div>
  );
}

function DocPanel({ title }: { title: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev">
      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-bg-sunken to-bg text-text-faint">
        <div className="text-center">
          <User size={32} className="mx-auto opacity-50" />
          <div className="mt-2 text-xs">Aperçu document</div>
        </div>
      </div>
      <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-faint">
        {title}
      </div>
    </div>
  );
}
