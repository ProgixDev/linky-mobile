'use client';

// Phase K.5 — server-wired DisputesKanban.
//
// Server data: useDisputes() returns orders where status='disputed' (polled
// every 30s). Two of the four columns ("Remboursés", "Libérés") show
// resolved orders, but list-disputes filters .eq('status','disputed') so it
// will not surface resolved orders on its own. We keep them visible via a
// session-only local map (`resolvedById`) that records orders this admin
// resolved during the current page load. A hard refresh wipes that map.
// V1.1 will either widen list-disputes to include "recently resolved" (last
// N days) or split it into a separate /list-resolved-disputes endpoint.
//
// "En examen" (reviewing) is also UI-only local state: dragging a card here
// is a personal "I'm looking at this" marker. It is NOT persisted server
// side — V1 ships single-admin so claim/assign would be over-engineering.
// Memo project_phase_k_kanban_reviewing_v1_1 covers the V1.1 migration to
// persistent claims via admin_actions.
//
// Drag handlers:
//   - drop on "reviewing" → add to local reviewingIds set
//   - drop on "received"  → remove from reviewingIds (cancel review)
//   - drop on "refunded" or "released" → open ConfirmResolveDialog with the
//     outcome pre-filled. Cancel reverts; confirm fires the resolve mutation
//     and stores the resolved item in resolvedById on success.
//
// Card click → DisputeDetailDrawer (read-only events + admin_actions). The
// drawer can re-launch the confirm dialog via its footer "Résoudre" button.

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  CircleAlert,
  Clock,
  ShieldCheck,
  PackageCheck,
  RefreshCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useDisputes,
  type DisputeListItem,
  type DisputeEvent,
} from '@/data/queries/disputes';
import { ConfirmResolveDialog } from './ConfirmResolveDialog';
import { DisputeDetailDrawer } from './DisputeDetailDrawer';

type ColumnId = 'received' | 'reviewing' | 'refunded' | 'released';

interface ColumnDef {
  id: ColumnId;
  title: string;
  Icon: LucideIcon;
  tint: string;
  tooltip?: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'received', title: 'Reçus', Icon: CircleAlert, tint: '#FBE7E5' },
  {
    id: 'reviewing',
    title: 'En examen',
    Icon: Clock,
    tint: '#FCF1DC',
    tooltip: 'Étape personnelle — assignation multi-admin V1.1',
  },
  { id: 'refunded', title: 'Remboursés', Icon: ShieldCheck, tint: '#E0F0E8' },
  { id: 'released', title: 'Libérés', Icon: PackageCheck, tint: '#E8EEF0' },
];

interface ResolvedEntry {
  item: DisputeListItem;
  outcome: 'refund' | 'release';
}

export function DisputesKanban() {
  const { data, isLoading, error, refetch } = useDisputes();
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(() => new Set());
  const [resolvedById, setResolvedById] = useState<Record<string, ResolvedEntry>>({});
  const [pendingDrop, setPendingDrop] = useState<{
    item: DisputeListItem;
    outcome: 'refund' | 'release';
  } | null>(null);
  const [detailItem, setDetailItem] = useState<DisputeListItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const grouped = useMemo(() => {
    const out: Record<ColumnId, DisputeListItem[]> = {
      received: [],
      reviewing: [],
      refunded: [],
      released: [],
    };
    const seen = new Set<string>();
    const serverItems = data?.disputes ?? [];
    for (const it of serverItems) {
      seen.add(it.order.id);
      const resolved = resolvedById[it.order.id];
      if (resolved) {
        out[resolved.outcome === 'refund' ? 'refunded' : 'released'].push(it);
      } else if (reviewingIds.has(it.order.id)) {
        out.reviewing.push(it);
      } else {
        out.received.push(it);
      }
    }
    // Session-resolved items that the server no longer returns (status now
    // 'refunded'|'released' → filtered out of list-disputes). Keep them
    // visible in their outcome column so the admin sees what they just did.
    for (const id of Object.keys(resolvedById)) {
      if (seen.has(id)) continue;
      const r = resolvedById[id];
      out[r.outcome === 'refund' ? 'refunded' : 'released'].push(r.item);
    }
    return out;
  }, [data, reviewingIds, resolvedById]);

  const findItem = (id: string): DisputeListItem | undefined => {
    return (
      (data?.disputes ?? []).find((d) => d.order.id === id) ??
      resolvedById[id]?.item
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    const overId = e.over?.id as ColumnId | undefined;
    if (!overId) return;
    const orderId = e.active.id as string;
    const item = findItem(orderId);
    if (!item) return;

    // Already-resolved items are locked into their outcome column. Allow only
    // re-opening the drawer via click; dragging back is a no-op so the admin
    // can't pretend they un-did a server-side verdict.
    if (resolvedById[orderId]) return;

    if (overId === 'reviewing') {
      setReviewingIds((prev) => {
        const next = new Set(prev);
        next.add(orderId);
        return next;
      });
      return;
    }
    if (overId === 'received') {
      setReviewingIds((prev) => {
        if (!prev.has(orderId)) return prev;
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      return;
    }
    const outcome: 'refund' | 'release' = overId === 'refunded' ? 'refund' : 'release';
    setPendingDrop({ item, outcome });
  };

  const onResolveSuccess = (item: DisputeListItem, outcome: 'refund' | 'release') => {
    setResolvedById((prev) => ({ ...prev, [item.order.id]: { item, outcome } }));
    setReviewingIds((prev) => {
      if (!prev.has(item.order.id)) return prev;
      const next = new Set(prev);
      next.delete(item.order.id);
      return next;
    });
    setPendingDrop(null);
  };

  const markReviewing = (orderId: string) => {
    setReviewingIds((prev) => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
  };

  const showInitialError = !!error && !data;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              column={col}
              items={grouped[col.id]}
              isLoading={isLoading && !data}
              isError={showInitialError}
              onRetry={() => refetch()}
              onCardClick={(it) => setDetailItem(it)}
            />
          ))}
        </div>
      </DndContext>

      {pendingDrop && (
        <ConfirmResolveDialog
          item={pendingDrop.item}
          outcome={pendingDrop.outcome}
          onCancel={() => setPendingDrop(null)}
          onResolved={(outcome) => onResolveSuccess(pendingDrop.item, outcome)}
        />
      )}

      {detailItem && (
        <DisputeDetailDrawer
          item={detailItem}
          inReviewing={reviewingIds.has(detailItem.order.id)}
          onClose={() => setDetailItem(null)}
          onMarkReviewing={() => markReviewing(detailItem.order.id)}
          onResolveClick={(item, outcome) => {
            setDetailItem(null);
            setPendingDrop({ item, outcome });
          }}
        />
      )}
    </>
  );
}

function Column({
  column,
  items,
  isLoading,
  isError,
  onRetry,
  onCardClick,
}: {
  column: ColumnDef;
  items: DisputeListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onCardClick: (item: DisputeListItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const { Icon } = column;

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-[480px] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors ${
        isOver ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2" title={column.tooltip}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: column.tint }}
          >
            <Icon size={14} />
          </div>
          <h3 className="text-sm font-bold tracking-tight">{column.title}</h3>
        </div>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">
          {items.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {isError && items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
            <span>Erreur de chargement</span>
            <button
              onClick={onRetry}
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-sunken px-3 py-1.5 text-xs font-bold hover:bg-line"
            >
              <RefreshCcw size={11} />
              Réessayer
            </button>
          </div>
        ) : isLoading && items.length === 0 ? (
          <SkeletonStack />
        ) : items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Aucun litige
          </div>
        ) : (
          items.map((it) => (
            <DisputeCard key={it.order.id} item={it} onClick={() => onCardClick(it)} />
          ))
        )}
      </div>
    </div>
  );
}

function SkeletonStack() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-line bg-sunken/40 p-3.5">
          <div className="h-3 w-1/2 rounded bg-line" />
          <div className="mt-2 h-4 w-3/4 rounded bg-line" />
          <div className="mt-2 h-3 w-2/3 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

function DisputeCard({
  item,
  onClick,
}: {
  item: DisputeListItem;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.order.id,
  });
  const o = item.order;
  const lastAt =
    o.events.length > 0 ? o.events[o.events.length - 1].at : o.createdAt;
  const reason = lastDisputeReason(o.events) ?? 'Litige ouvert';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Translate.toString(transform) || undefined,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
      className={`cursor-grab rounded-xl border border-line bg-sunken/40 p-3.5 active:cursor-grabbing ${
        isDragging ? 'shadow-[var(--shadow-pop)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-faint">
          {o.reference}
        </div>
        <div className="text-[11px] text-faint">{formatAgo(lastAt)}</div>
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-bold leading-snug">{reason}</div>
      <div className="mt-2.5 text-xs text-muted">
        {item.buyer.displayName ?? item.buyer.id.slice(0, 8)}{' '}
        <span className="text-faint">vs</span>{' '}
        {item.seller.displayName ?? item.seller.id.slice(0, 8)}
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-bold tabular-nums">
          {(o.totalGnf / 1000).toLocaleString('fr-FR')} k GNF
        </span>
      </div>
    </div>
  );
}

// Phase K dispute events look like { at, kind:'disputed', reason }. Older
// events use { at, label }. Walk the array from newest to surface the most
// recent dispute reason; fall back to the latest label, then to a default.
function lastDisputeReason(events: DisputeEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'disputed' && typeof e.reason === 'string' && e.reason) {
      return e.reason;
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const label = events[i]?.label;
    if (typeof label === 'string' && label) return label;
  }
  return undefined;
}

function formatAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
