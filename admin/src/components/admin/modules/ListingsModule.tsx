'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Flag, EyeOff } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { listingsData, type Listing, type ListingStatus } from '@/data/mock';

const STATUS_META: Record<ListingStatus, { label: string; cls: string }> = {
  live: { label: 'En ligne', cls: 'bg-success/12 text-success' },
  pending: { label: 'En attente', cls: 'bg-accent-soft text-accent-text' },
  flagged: { label: 'Signalée', cls: 'bg-danger/12 text-danger' },
  paused: { label: 'Pause', cls: 'bg-bg-sunken text-text-muted' },
  rejected: { label: 'Refusée', cls: 'bg-danger/12 text-danger' },
};

const columns: ColumnDef<Listing>[] = [
  {
    accessorKey: 'title',
    header: 'Annonce',
    cell: ({ row }) => {
      const l = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-sunken text-[10px] font-bold uppercase text-text-muted">
            {l.kind === 'product' ? 'PR' : 'IM'}
          </div>
          <div className="min-w-0">
            <div className="truncate font-bold">{l.title}</div>
            <div className="text-xs text-text-muted">
              {l.ref} · {l.category}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'shopName',
    header: 'Vendeur',
  },
  {
    accessorKey: 'city',
    header: 'Ville',
  },
  {
    accessorKey: 'priceGnf',
    header: 'Prix',
    cell: ({ row }) => (
      <span className="font-bold tabular-nums">
        {(row.original.priceGnf / 1000).toLocaleString('fr-FR')} k
      </span>
    ),
  },
  {
    accessorKey: 'views',
    header: 'Vues',
    cell: ({ row }) => (
      <span className="tabular-nums text-text-muted">
        {row.original.views.toLocaleString('fr-FR')}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const l = row.original;
      const m = STATUS_META[l.status];
      return (
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
          >
            {m.label}
          </span>
          {l.flags && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-danger">
              <Flag size={10} fill="currentColor" />
              {l.flags}
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <div className="flex items-center justify-end gap-1">
        <IconButton title="Voir">
          <Eye size={15} />
        </IconButton>
        <IconButton title="Masquer" danger>
          <EyeOff size={15} />
        </IconButton>
      </div>
    ),
  },
];

function IconButton({
  children,
  title,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-sunken ${
        danger ? 'hover:text-danger' : 'hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

export function ListingsModule() {
  return (
    <DataTable<Listing, unknown>
      data={listingsData}
      columns={columns}
      searchKey="title"
      searchPlaceholder="Rechercher une annonce…"
    />
  );
}
