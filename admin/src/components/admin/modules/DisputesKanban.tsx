'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type UniqueIdentifier,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Clock, ShieldCheck, X, CircleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { disputesData, type Dispute, type DisputeColumn } from '@/data/mock';

const COLUMNS: {
  id: DisputeColumn;
  title: string;
  Icon: LucideIcon;
  tint: string;
}[] = [
  { id: 'received', title: 'Reçus', Icon: CircleAlert, tint: '#FBE7E5' },
  { id: 'reviewing', title: 'En examen', Icon: Clock, tint: '#FCF1DC' },
  { id: 'refunded', title: 'Remboursés', Icon: ShieldCheck, tint: '#E0F0E8' },
  { id: 'rejected', title: 'Rejetés', Icon: X, tint: '#F0E8E0' },
];

export function DisputesKanban() {
  const [items, setItems] = useState<Dispute[]>(disputesData);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const grouped = useMemo(() => {
    const out: Record<DisputeColumn, Dispute[]> = {
      received: [],
      reviewing: [],
      refunded: [],
      rejected: [],
    };
    for (const d of items) out[d.column].push(d);
    return out;
  }, [items]);

  const onDragEnd = (e: DragEndEvent) => {
    const overId = e.over?.id as DisputeColumn | undefined;
    if (!overId) return;
    const id = e.active.id as string;
    setItems((prev) =>
      prev.map((d) => (d.id === id ? { ...d, column: overId } : d)),
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            title={col.title}
            Icon={col.Icon}
            tint={col.tint}
            items={grouped[col.id]}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  id,
  title,
  Icon,
  tint,
  items,
}: {
  id: DisputeColumn;
  title: string;
  Icon: LucideIcon;
  tint: string;
  items: Dispute[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-[480px] flex-col gap-3 rounded-2xl border border-border bg-bg-elev p-4 transition-colors ${
        isOver ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: tint }}
          >
            <Icon size={14} />
          </div>
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        </div>
        <span className="rounded-full bg-bg-sunken px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-muted">
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {items.map((d) => (
          <DisputeCard key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}

function DisputeCard({ d }: { d: Dispute }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: d.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform) || undefined,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
      className={`cursor-grab rounded-xl border border-border bg-bg-sunken/40 p-3.5 active:cursor-grabbing ${
        isDragging ? 'shadow-[var(--shadow-pop)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
          {d.orderRef}
        </div>
        <div className="text-[11px] text-text-faint">{d.ago}</div>
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-bold leading-snug">
        {d.reason}
      </div>
      <div className="mt-2.5 text-xs text-text-muted">
        {d.buyer} <span className="text-text-faint">vs</span> {d.seller}
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="rounded-md bg-bg-elev px-2 py-0.5 text-xs font-bold tabular-nums">
          {(d.amountGnf / 1000).toLocaleString('fr-FR')} k GNF
        </span>
      </div>
    </div>
  );
}
