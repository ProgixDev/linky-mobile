'use client';

// Final sprint §2 — the orders table now reads real production orders
// (list-orders-admin, read-only). The disputes Kanban was already live.

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { DisputesKanban } from './DisputesKanban';
import { useAdminOrders, type AdminOrder, type AdminOrderStatus } from '@/data/queries/orders-admin';

const STATUS_META: Record<AdminOrderStatus, { label: string; cls: string }> = {
  placed: { label: 'PASSÉE', cls: 'bg-sunken text-muted' },
  paid: { label: 'PAYÉE', cls: 'bg-accent-soft text-accent-text' },
  preparing: { label: 'EN COURS', cls: 'bg-accent-soft text-accent-text' },
  delivered: { label: 'LIVRÉE', cls: 'bg-primary-soft text-primary-deep' },
  released: { label: 'TERMINÉE', cls: 'bg-success/12 text-success' },
  disputed: { label: 'LITIGE', cls: 'bg-danger/12 text-danger' },
  cancelled: { label: 'ANNULÉE', cls: 'bg-sunken text-muted' },
  refunded: { label: 'REMBOURSÉE', cls: 'bg-danger/12 text-danger' },
};

const columns: ColumnDef<AdminOrder>[] = [
  {
    accessorKey: 'reference',
    header: 'Référence',
    cell: ({ row }) => (
      <span className="font-bold tabular-nums">{row.original.reference}</span>
    ),
  },
  {
    id: 'product',
    header: 'Article',
    meta: { cellClassName: 'hidden md:table-cell' },
    cell: ({ row }) => (
      <div className="max-w-[260px] truncate">
        {row.original.product_snapshot?.title ?? '—'}
      </div>
    ),
  },
  {
    id: 'buyer',
    header: 'Acheteur',
    meta: { cellClassName: 'hidden lg:table-cell' },
    cell: ({ row }) => row.original.buyer?.display_name ?? '—',
  },
  {
    id: 'seller',
    header: 'Vendeur',
    meta: { cellClassName: 'hidden lg:table-cell' },
    cell: ({ row }) => row.original.seller?.display_name ?? '—',
  },
  {
    accessorKey: 'total_minor',
    header: 'Montant',
    cell: ({ row }) => (
      <span className="font-bold tabular-nums">
        {Number(row.original.total_minor).toLocaleString('fr-FR')} GNF
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const m = STATUS_META[row.original.status] ?? STATUS_META.placed;
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
    accessorKey: 'created_at',
    header: 'Date',
    meta: { cellClassName: 'hidden md:table-cell' },
    cell: ({ row }) =>
      new Date(row.original.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
      }),
  },
];

export function OrdersModule() {
  const [tab, setTab] = useState<'kanban' | 'table'>('kanban');
  const { data: orders, isLoading, isError } = useAdminOrders();

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-full bg-surface p-1.5 ring-1 ring-border">
        <TabBtn label="Kanban litiges" active={tab === 'kanban'} onClick={() => setTab('kanban')} />
        <TabBtn
          label="Table commandes"
          active={tab === 'table'}
          onClick={() => setTab('table')}
        />
      </div>

      {tab === 'kanban' ? (
        <DisputesKanban />
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des commandes…
        </div>
      ) : isError ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
          Impossible de charger les commandes. Réessaie.
        </div>
      ) : (
        <DataTable<AdminOrder, unknown>
          data={orders ?? []}
          columns={columns}
          searchKey="reference"
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
        active ? 'bg-black text-white' : 'text-muted hover:text-[#0E1311]'
      }`}
    >
      {label}
    </button>
  );
}
