'use client';

// Phase P.5 — KYC review queue, wired to the real backend (was mock-only).
//
// Didit's hosted flow owns the document capture, so there are no image
// panels here : the review pane renders the provider's decision payload
// (OCR / liveness / face-match results) defensively, plus the manual
// approve / decline bar for in_review cases — the client-required fallback
// for private homeowners and documents Didit can't auto-verify.

import { useState } from 'react';
import { ShieldCheck, X, FileText, Calendar, Clock, Loader2 } from 'lucide-react';
import { useKycSessions, useKycDecide, type KycSessionRow } from '@/data/queries/kyc';

function initialsOf(name: string | null | undefined): string {
  return (name ?? 'Utilisateur')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'EN ATTENTE',
  in_review: 'EXAMEN',
};

export function KycModule() {
  const { data: sessions, isLoading, isError } = useKycSessions('open');
  const [activeId, setActiveId] = useState<string | null>(null);

  const open = sessions ?? [];
  const active = open.find((s) => s.id === activeId) ?? open[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-220px)] items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" /> Chargement de la file…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-[calc(100vh-220px)] items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
        Impossible de charger la file KYC. Réessaie.
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-220px)] gap-6 lg:grid-cols-[420px_1fr]">
      {/* Queue */}
      <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-bold">File d&apos;attente</div>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent-text">
            {open.length}
          </span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {open.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Tout est traité 🎉
            </div>
          ) : (
            open.map((s) => {
              const isActive = active?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary-soft'
                      : 'border-line bg-sunken/40 hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-xs font-bold">
                      {initialsOf(s.users?.display_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {s.users?.display_name ?? 'Utilisateur Linky'}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(s.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      {STATUS_LABEL[s.status] ?? s.status}
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
        <ReviewPane key={active.id} session={active} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
          Sélectionne une demande à gauche.
        </div>
      )}
    </div>
  );
}

// Didit decision payloads vary by workflow features. We surface the
// well-known sections when present and never assume shape — anything we
// can't read renders as "non fourni". `ok` drives the row icon : a failed
// liveness check must NOT render a green shield on a decision console.
interface DecisionCheck {
  label: string;
  value: string;
  ok: boolean | null; // null = indeterminate → neutral icon
}

function checkVerdict(status: unknown): boolean | null {
  if (typeof status !== 'string') return null;
  if (/approved|passed|ok|success|clear/i.test(status)) return true;
  if (/declined|failed|rejected|suspect/i.test(status)) return false;
  return null;
}

function decisionChecks(decision: Record<string, unknown> | null): DecisionCheck[] {
  if (!decision) return [];
  const checks: DecisionCheck[] = [];
  const sections: Array<[string, string]> = [
    ['id_verification', 'Pièce d’identité'],
    ['document', 'Document'],
    ['face_match', 'Correspondance visage'],
    ['liveness', 'Test de vie'],
    ['ip_analysis', 'Analyse IP'],
    ['aml', 'Filtrage AML'],
  ];
  for (const [key, label] of sections) {
    const section = decision[key];
    if (section && typeof section === 'object') {
      const status = (section as Record<string, unknown>).status;
      const score = (section as Record<string, unknown>).score;
      const parts: string[] = [];
      if (typeof status === 'string') parts.push(status);
      if (typeof score === 'number') parts.push(`score ${Math.round(score * 100) / 100}`);
      checks.push({ label, value: parts.length ? parts.join(' · ') : 'reçu', ok: checkVerdict(status) });
    }
  }
  if (checks.length === 0 && typeof decision.status === 'string') {
    checks.push({ label: 'Statut fournisseur', value: decision.status, ok: checkVerdict(decision.status) });
  }
  return checks;
}

function ReviewPane({ session }: { session: KycSessionRow }) {
  const decide = useKycDecide();
  const checks = decisionChecks(session.decision);
  const name = session.users?.display_name ?? 'Utilisateur Linky';

  return (
    <div className="flex flex-col gap-5 overflow-y-auto">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-base font-bold">
            {initialsOf(session.users?.display_name)}
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-sunken px-2 py-0.5 font-bold uppercase tracking-wider">
                {STATUS_LABEL[session.status] ?? session.status}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={11} /> Vérification Didit
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {new Date(session.created_at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {session.decided_via && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> via {session.decided_via}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Automatic checks from the provider decision */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-faint">
          Vérifications automatiques (Didit)
        </div>
        {checks.length === 0 ? (
          <div className="mt-3 text-sm text-muted">
            Pas encore de résultat fournisseur — l&apos;utilisateur n&apos;a peut-être pas terminé le
            parcours, ou la décision arrive par webhook.
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    c.ok === true ? 'bg-success/15' : c.ok === false ? 'bg-danger/15' : 'bg-sunken'
                  }`}
                >
                  {c.ok === false ? (
                    <X size={11} className="text-danger" strokeWidth={3} />
                  ) : (
                    <ShieldCheck
                      size={11}
                      className={c.ok === true ? 'text-success' : 'text-muted'}
                      strokeWidth={3}
                    />
                  )}
                </div>
                <span className="text-sm">{c.label}</span>
                <span className="ml-auto text-xs font-semibold text-muted">{c.value}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-xs text-faint">
          Les documents complets (photos, OCR) sont consultables dans la console Didit — session
          examinée manuellement quand le fournisseur renvoie « In Review ».
        </div>
      </div>

      {/* Decision bar */}
      <div className="sticky bottom-0 flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)]">
        <button
          onClick={() => decide.mutate({ session_id: session.id, outcome: 'decline' })}
          disabled={decide.isPending}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger/10 text-sm font-bold text-danger ring-1 ring-danger/25 hover:bg-danger/15 disabled:opacity-50"
        >
          <X size={15} strokeWidth={2.25} />
          Rejeter
        </button>
        <button
          onClick={() => decide.mutate({ session_id: session.id, outcome: 'approve' })}
          disabled={decide.isPending}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          style={{ flex: '1.5 1 0' }}
        >
          {decide.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ShieldCheck size={15} strokeWidth={2.25} />
          )}
          Valider la vérification
        </button>
      </div>
    </div>
  );
}
