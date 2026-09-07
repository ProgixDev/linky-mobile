'use client';

// Final sprint §2 — the orders table now reads real production orders
// (list-orders-admin, read-only). The disputes Kanban was already live.

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { DisputesKanban } from './DisputesKanban';
import {
  useAdminOrders, canForceResolve, type AdminOrder, type AdminOrderStatus,
} from '@/data/queries/orders-admin';
import { ForceResolveDialog } from './ForceResolveDialog';

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

// Fabrique plutot que constante : la colonne d'action doit pouvoir ouvrir le
// dialogue, donc connaitre le setter du module.
function buildColumns(onForceResolve: (o: AdminOrder) => void): ColumnDef<AdminOrder>[] {
  return [
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
  {
    id: 'action',
    header: '',
    // Le bouton n'apparait QUE sur les statuts que le serveur accepte
    // (canForceResolve). Le montrer ailleurs donnerait un INVALID_STATUS que
    // l'admin ne peut pas corriger — un bouton qui ne marche jamais use la
    // confiance dans tous les autres.
    cell: ({ row }) =>
      canForceResolve(row.original.status) ? (
        <button
          type="button"
          onClick={() => onForceResolve(row.original)}
          className="rounded-lg bg-sunken px-2.5 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-line hover:text-[#0E1311]"
        >
          Débloquer
        </button>
      ) : null,
  },
  ];
}

export function OrdersModule() {
  const [tab, setTab] = useState<'kanban' | 'table'>('kanban');
  const [forceTarget, setForceTarget] = useState<AdminOrder | null>(null);
  const { data: orders, isLoading, isError } = useAdminOrders();
  // useMemo n'apporterait rien de mesurable ici (une poignee de commandes) et
  // ajouterait une dependance a tenir a jour.
  const columns = buildColumns(setForceTarget);

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

      {forceTarget && (
        <ForceResolveDialog order={forceTarget} onClose={() => setForceTarget(null)} />
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
