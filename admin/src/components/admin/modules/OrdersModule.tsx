'use client';

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/admin/DataTable';
import { DisputesKanban } from './DisputesKanban';
import { ordersData, type Order, type OrderStatus } from '@/data/mock';

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  placed: { label: 'PASSÉE', cls: 'bg-bg-sunken text-text-muted' },
  paid: { label: 'PAYÉE', cls: 'bg-accent-soft text-accent-text' },
  preparing: { label: 'EN COURS', cls: 'bg-accent-soft text-accent-text' },
  delivered: { label: 'LIVRÉE', cls: 'bg-primary-soft text-primary-deep' },
  released: { label: 'TERMINÉE', cls: 'bg-success/12 text-success' },
  disputed: { label: 'LITIGE', cls: 'bg-danger/12 text-danger' },
};

const columns: ColumnDef<Order>[] = [
  {
    accessorKey: 'ref',
    header: 'Référence',
    cell: ({ row }) => (
      <span className="font-bold tabular-nums">{row.original.ref}</span>
    ),
  },
  {
    accessorKey: 'product',
    header: 'Article',
    cell: ({ row }) => (
      <div className="max-w-[260px] truncate">{row.original.product}</div>
    ),
  },
  {
    accessorKey: 'buyer',
    header: 'Acheteur',
  },
  {
    accessorKey: 'seller',
    header: 'Vendeur',
  },
  {
    accessorKey: 'totalGnf',
    header: 'Montant',
    cell: ({ row }) => (
      <span className="font-bold tabular-nums">
        {(row.original.totalGnf / 1000).toLocaleString('fr-FR')} k
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const m = STATUS_META[row.original.status];
      return (
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
        >
          {m.label}
        </span>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      }),
  },
];

export function OrdersModule() {
  const [tab, setTab] = useState<'kanban' | 'table'>('kanban');
  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-full bg-bg-elev p-1.5 ring-1 ring-border">
        <TabBtn label="Kanban litiges" active={tab === 'kanban'} onClick={() => setTab('kanban')} />
        <TabBtn
          label="Table commandes"
          active={tab === 'table'}
          onClick={() => setTab('table')}
        />
      </div>

      {tab === 'kanban' ? (
        <DisputesKanban />
      ) : (
        <DataTable<Order, unknown>
          data={ordersData}
          columns={columns}
          searchKey="ref"
          searchPlaceholder="Rechercher par référence…"
        />
      )}
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
        active ? 'bg-text text-bg' : 'text-text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}
