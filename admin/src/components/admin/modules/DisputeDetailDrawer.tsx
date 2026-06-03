'use client';

// Side drawer for inspecting a single dispute: order details + event timeline
// + admin_actions history. Opened by clicking a Kanban card.
//
// Data flow: parent passes the cached DisputeListItem (which has buyer/seller
// display names from list-disputes' stitch step). We fetch fresh via
// get-dispute to pick up admin_actions and any newer events. The buyer/seller
// names come from the cached item — get-dispute response only carries IDs.
//
// Admin meta: get-dispute is called with the admin's bearer, so the server
// returns events with admin_id intact (includeAdminMeta:true). We surface it
// in the timeline for accountability. Buyer/seller views of the same order
// would NOT see admin_id — that strip lives in the catalog mapper.

import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useDispute,
  type DisputeListItem,
  type DisputeEvent,
  type DisputeOrder,
  type AdminAction,
} from '@/data/queries/disputes';

export function DisputeDetailDrawer({
  item,
  inReviewing,
  onClose,
  onMarkReviewing,
  onResolveClick,
}: {
  item: DisputeListItem;
  inReviewing: boolean;
  onClose: () => void;
  onMarkReviewing: () => void;
  onResolveClick: (item: DisputeListItem, outcome: 'refund' | 'release') => void;
}) {
  const { data, isLoading, error } = useDispute(item.order.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prefer the fresh order from get-dispute; fall back to the cached item
  // while loading so the header doesn't flash empty.
  const order = data?.order ?? item.order;
  const adminActions = data?.admin_actions ?? [];

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Fermer le panneau"
      />
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-[600px] flex-col bg-surface shadow-[var(--shadow-pop)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-detail-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2
              id="dispute-detail-title"
              className="font-display text-lg font-bold tracking-tight"
            >
              {order.reference}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold tabular-nums">
                {(order.totalGnf / 1000).toLocaleString('fr-FR')} k GNF
              </span>
              <StatusBadge status={order.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-md p-1 text-muted hover:bg-sunken"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && !data && <SkeletonBody />}
          {error && !data && (
            <div className="text-sm text-danger">Erreur de chargement du détail.</div>
          )}
          <Body item={item} order={order} adminActions={adminActions} />
        </div>

        {order.status === 'disputed' && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
            <button
              onClick={onClose}
              type="button"
              className="rounded-xl bg-sunken px-4 py-2.5 text-sm font-bold hover:bg-line"
            >
              Fermer
            </button>
            {!inReviewing && (
              <button
                onClick={onMarkReviewing}
                type="button"
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold hover:bg-sunken"
              >
                Marquer en examen
              </button>
            )}
            <button
              onClick={() => onResolveClick(item, 'refund')}
              type="button"
              className="rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Résoudre
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disputed: { label: 'LITIGE', cls: 'bg-danger/12 text-danger' },
    refunded: { label: 'REMBOURSÉ', cls: 'bg-accent-soft text-accent-text' },
    released: { label: 'LIBÉRÉ', cls: 'bg-success/12 text-success' },
    paid: { label: 'PAYÉ', cls: 'bg-accent-soft text-accent-text' },
    placed: { label: 'PASSÉE', cls: 'bg-sunken text-muted' },
  };
  const m = map[status] ?? { label: status.toUpperCase(), cls: 'bg-sunken text-muted' };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line bg-sunken/40 p-4">
          <div className="h-3 w-1/3 rounded bg-line" />
          <div className="h-4 w-2/3 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

function Body({
  item,
  order,
  adminActions,
}: {
  item: DisputeListItem;
  order: DisputeOrder;
  adminActions: AdminAction[];
}) {
  const snap = order.productSnapshot;
  const events = [...order.events].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  return (
    <div className="space-y-5">
      <Section title="Acheteur">
        <Participant
          name={item.buyer.displayName}
          email={item.buyer.email}
          id={item.buyer.id}
        />
      </Section>

      <Section title="Vendeur">
        <Participant
          name={item.seller.displayName}
          email={item.seller.email}
          id={item.seller.id}
        />
      </Section>

      <Section title="Article">
        <div className="flex items-start gap-3">
          {snap?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snap.photo}
              alt=""
              className="h-16 w-16 flex-none rounded-xl object-cover"
            />
          ) : (
            <div className="h-16 w-16 flex-none rounded-xl bg-sunken" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{snap?.title ?? '—'}</div>
            <div className="mt-1 text-xs text-muted">
              Quantité&nbsp;: {order.quantity} ·{' '}
              {(snap?.priceGnf ?? 0).toLocaleString('fr-FR')} GNF
            </div>
          </div>
        </div>
      </Section>

      <Section title="Timeline">
        {events.length === 0 ? (
          <div className="text-xs text-muted">Aucun événement.</div>
        ) : (
          <div className="space-y-2.5">
            {events.map((e, i) => (
              <EventRow key={i} event={e} />
            ))}
          </div>
        )}
      </Section>

      {adminActions.length > 0 && (
        <Section title="Historique admin">
          <div className="space-y-2.5">
            {adminActions.map((a) => (
              <AdminActionRow key={a.id} action={a} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-faint">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Participant({
  name,
  email,
  id,
}: {
  name?: string;
  email?: string;
  id: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="font-bold">{name ?? '—'}</div>
      {email && <div className="text-xs text-muted">{email}</div>}
      <div className="font-mono text-[11px] text-faint">{id}</div>
    </div>
  );
}

function EventRow({ event }: { event: DisputeEvent }) {
  const at = new Date(event.at);
  const rawLabel = typeof event.label === 'string' ? event.label : undefined;
  const kind = typeof event.kind === 'string' ? event.kind : undefined;
  const label = rawLabel ?? kind ?? 'événement';
  const outcome = typeof event.outcome === 'string' ? event.outcome : undefined;
  const reason = typeof event.reason === 'string' ? event.reason : undefined;
  const note = typeof event.note === 'string' ? event.note : undefined;
  const adminId = typeof event.admin_id === 'string' ? event.admin_id : undefined;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold capitalize">{label}</span>
        <span className="text-[11px] text-faint">
          {at.toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {(outcome || reason || note || adminId) && (
        <div className="mt-2 space-y-1 text-xs text-muted">
          {outcome && (
            <div>
              <span className="text-faint">Verdict :</span> {outcome}
            </div>
          )}
          {reason && (
            <div>
              <span className="text-faint">Motif :</span> {reason}
            </div>
          )}
          {note && (
            <div>
              <span className="text-faint">Note :</span> {note}
            </div>
          )}
          {adminId && (
            <div>
              <span className="text-faint">Admin :</span>{' '}
              <span className="font-mono">{adminId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminActionRow({ action }: { action: AdminAction }) {
  const [expanded, setExpanded] = useState(false);
  const outcome =
    typeof action.metadata?.outcome === 'string' ? action.metadata.outcome : undefined;
  const hasDiff = !!(action.beforeSnapshot || action.afterSnapshot);

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{action.action}</span>
        <span className="text-[11px] text-faint">
          {new Date(action.createdAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className="mt-1 space-y-1 text-xs text-muted">
        {outcome && (
          <div>
            <span className="text-faint">Verdict :</span> {outcome}
          </div>
        )}
        {action.reason && (
          <div>
            <span className="text-faint">Motif :</span> {action.reason}
          </div>
        )}
        <div>
          <span className="text-faint">Admin :</span>{' '}
          <span className="font-mono">{action.adminId}</span>
        </div>
      </div>
      {hasDiff && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            type="button"
            className="mt-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-faint hover:text-muted"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Diff snapshot
          </button>
          {expanded && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-faint">Avant</div>
                <pre className="mt-1 overflow-x-auto rounded bg-sunken p-2 font-mono text-[10px]">
                  {JSON.stringify(action.beforeSnapshot ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-faint">Après</div>
                <pre className="mt-1 overflow-x-auto rounded bg-sunken p-2 font-mono text-[10px]">
                  {JSON.stringify(action.afterSnapshot ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
