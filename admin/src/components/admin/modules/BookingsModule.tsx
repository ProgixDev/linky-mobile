'use client';

// Bookings console (2026-07-07) — the admin counterpart of the mobile rental
// booking flow. Layout mirrors Withdrawals: queue left, detail pane right.
//
// The actionable states are 'paid' (money sits in escrow) and 'disputed'
// (frozen by an admin). From there the console can:
//   - Rembourser  : escrow → locataire (loyer + frais), statut 'refunded'
//   - Verser      : escrow → propriétaire (+ frais plateforme), statut 'active'
//   - Litige      : paid → disputed (gel, aucun mouvement d'argent)
// Everything else is read-only context.

import { useState } from 'react';
import {
  CalendarCheck,
  Calendar,
  Loader2,
  ShieldAlert,
  Undo2,
  Check,
} from 'lucide-react';
import {
  useAdminBookings,
  useResolveBooking,
  type AdminBookingRow,
  type BookingStatus,
} from '@/data/queries/bookings';

function gnf(n: number): string {
  return `${n.toLocaleString('fr-FR')} GNF`;
}

function initialsOf(name: string | null | undefined): string {
  return (name ?? 'Locataire')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function dateFR(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function periodText(b: AdminBookingRow): string {
  if (b.period === 'day') {
    return `Du ${dateFR(b.start_date)} au ${b.end_date ? dateFR(b.end_date) : '—'}`;
  }
  return `${b.months ?? 1} mois à partir du ${dateFR(b.start_date)}`;
}

const STATUS_META: Record<BookingStatus, { label: string; cls: string }> = {
  requested: { label: 'Demandée', cls: 'bg-sunken text-muted' },
  accepted: { label: 'Acceptée', cls: 'bg-sunken text-muted' },
  rejected: { label: 'Refusée', cls: 'bg-sunken text-muted' },
  cancelled: { label: 'Annulée', cls: 'bg-sunken text-muted' },
  paid: { label: 'Payée — séquestre', cls: 'bg-primary-soft text-primary-deep' },
  active: { label: 'Bail actif', cls: 'bg-primary-soft text-primary-deep' },
  disputed: { label: 'Litige', cls: 'bg-danger/10 text-danger' },
  refunded: { label: 'Remboursée', cls: 'bg-sunken text-muted' },
  completed: { label: 'Terminée', cls: 'bg-sunken text-muted' },
};

const FILTERS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'paid', label: 'En séquestre' },
  { key: 'disputed', label: 'Litiges' },
  { key: 'active', label: 'Actives' },
  { key: 'all', label: 'Toutes' },
];

export function BookingsModule() {
  const [filter, setFilter] = useState<BookingStatus | 'all'>('paid');
  const { data: bookings, isLoading, isError } = useAdminBookings(
    filter === 'all' ? undefined : filter,
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const rows = bookings ?? [];
  const active = rows.find((b) => b.id === activeId) ?? rows[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setActiveId(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              filter === f.key
                ? 'bg-primary text-white'
                : 'bg-surface text-muted ring-1 ring-line hover:bg-sunken'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted lg:h-[calc(100vh-270px)]">
          <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des réservations…
        </div>
      ) : isError ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger lg:h-[calc(100vh-270px)]">
          Impossible de charger les réservations. Réessaie.
        </div>
      ) : (
        <div className="grid gap-6 lg:h-[calc(100vh-270px)] lg:grid-cols-[420px_1fr]">
          {/* Queue */}
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4 lg:max-h-none">
            <div className="flex items-center justify-between px-1">
              <div className="text-sm font-bold">Réservations</div>
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent-text">
                {rows.length}
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  Aucune réservation dans ce filtre.
                </div>
              ) : (
                rows.map((b) => {
                  const isActive = active?.id === b.id;
                  const meta = STATUS_META[b.status];
                  return (
                    <button
                      key={b.id}
                      onClick={() => setActiveId(b.id)}
                      className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                        isActive
                          ? 'border-primary bg-primary-soft'
                          : 'border-line bg-sunken/40 hover:bg-sunken'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-xs font-bold">
                          {initialsOf(b.tenant_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">
                            {b.property_title ?? 'Logement'}
                          </div>
                          <div className="truncate text-xs text-muted">
                            {b.tenant_name ?? 'Locataire'} → {b.landlord_name ?? 'Propriétaire'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums">{gnf(b.total_minor)}</div>
                          <span
                            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
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
            <DetailPane key={active.id} booking={active} />
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
              Sélectionne une réservation à gauche.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPane({ booking }: { booking: AdminBookingRow }) {
  const resolve = useResolveBooking();
  const [confirming, setConfirming] = useState<'refund' | 'release' | 'dispute' | null>(null);
  const [reason, setReason] = useState('');

  const meta = STATUS_META[booking.status];
  const resolvable = booking.status === 'paid' || booking.status === 'disputed';

  const CONFIRM_COPY: Record<'refund' | 'release' | 'dispute', { title: string; body: string; cta: string; danger?: boolean }> = {
    refund: {
      title: 'Rembourser le locataire',
      body: `${gnf(booking.total_minor)} (loyer + frais) quittent le séquestre vers le wallet de ${booking.tenant_name ?? 'le locataire'}. Irréversible.`,
      cta: 'Confirmer le remboursement',
      danger: true,
    },
    release: {
      title: 'Verser au propriétaire',
      body: `${gnf(booking.amount_minor)} vont au wallet de ${booking.landlord_name ?? 'le propriétaire'} (+ ${gnf(booking.fees_minor)} de frais plateforme). Irréversible.`,
      cta: 'Confirmer le versement',
    },
    dispute: {
      title: 'Placer en litige',
      body: "Gèle la réservation le temps d'enquêter — aucun mouvement d'argent. Tu pourras ensuite rembourser ou verser.",
      cta: 'Confirmer le litige',
    },
  };

  return (
    <div className="flex flex-col gap-5 overflow-y-auto">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken">
            <CalendarCheck size={22} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {booking.property_title ?? 'Logement'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${meta.cls}`}>
                {meta.label}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {periodText(booking)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold tabular-nums">
              {gnf(booking.total_minor)}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-faint">
              en séquestre (loyer + frais)
            </div>
          </div>
        </div>
      </div>

      {/* Parties + amounts */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-faint">Détails</div>
        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Locataire</span>
            <span className="font-semibold">{booking.tenant_name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Propriétaire</span>
            <span className="font-semibold">{booking.landlord_name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Bien</span>
            <span className="font-semibold">
              {[booking.property_district, booking.property_city].filter(Boolean).join(', ') || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">
              {booking.period === 'day' ? 'Loyer / jour' : 'Loyer / mois'}
            </span>
            <span className="font-bold tabular-nums">{gnf(booking.rent_minor)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Loyer total (propriétaire)</span>
            <span className="font-bold tabular-nums">{gnf(booking.amount_minor)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Frais de service (3%)</span>
            <span className="font-bold tabular-nums">{gnf(booking.fees_minor)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Créée le</span>
            <span className="font-semibold">
              {new Date(booking.created_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        {!resolvable && (
          <div className="mt-4 text-xs text-faint">
            Aucune action possible sur ce statut — l&apos;argent n&apos;est pas (ou plus) dans le
            séquestre. Les remboursements après versement sont une opération support manuelle.
          </div>
        )}
      </div>

      {/* Confirm + reason */}
      {confirming && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="text-sm font-bold">{CONFIRM_COPY[confirming].title}</div>
          <p className="mt-2 text-xs text-muted">{CONFIRM_COPY[confirming].body}</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Motif (audit interne, optionnel)…"
            className="mt-3 w-full resize-none rounded-xl border border-line bg-sunken/40 p-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => {
                setConfirming(null);
                setReason('');
              }}
              disabled={resolve.isPending}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                resolve.mutate(
                  {
                    booking_id: booking.id,
                    action: confirming,
                    reason: reason.trim() || undefined,
                  },
                  { onSuccess: () => setConfirming(null) },
                )
              }
              disabled={resolve.isPending}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 ${
                CONFIRM_COPY[confirming].danger ? 'bg-danger' : 'bg-black'
              }`}
              style={{ flex: '1.5 1 0' }}
            >
              {resolve.isPending && <Loader2 size={15} className="animate-spin" />}
              {CONFIRM_COPY[confirming].cta}
            </button>
          </div>
        </div>
      )}

      {/* Decision bar */}
      {resolvable && !confirming && (
        <div className="sticky bottom-0 flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)]">
          <button
            onClick={() => setConfirming('refund')}
            disabled={resolve.isPending}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger/10 text-sm font-bold text-danger ring-1 ring-danger/25 hover:bg-danger/15 disabled:opacity-50"
          >
            <Undo2 size={15} strokeWidth={2.25} />
            Rembourser
          </button>
          {booking.status === 'paid' && (
            <button
              onClick={() => setConfirming('dispute')}
              disabled={resolve.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
            >
              <ShieldAlert size={15} strokeWidth={2.25} />
              Litige
            </button>
          )}
          <button
            onClick={() => setConfirming('release')}
            disabled={resolve.isPending}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            style={{ flex: '1.5 1 0' }}
          >
            <Check size={15} strokeWidth={2.25} />
            Verser au propriétaire
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-faint">
        <CalendarCheck size={13} />
        Chaque décision est tracée (audit admin) et notifie les parties par push.
      </div>
    </div>
  );
}
