'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreVertical, Mail, ShieldOff } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { usersData, type User, type UserStatus } from '@/data/mock';

const STATUS_META: Record<UserStatus, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-success/12 text-success' },
  pending: { label: 'En attente', cls: 'bg-accent-soft text-accent-text' },
  suspended: { label: 'Suspendu', cls: 'bg-danger/12 text-danger' },
};

const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Utilisateur',
    cell: ({ row }) => {
      const u = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-sunken text-xs font-bold">
            {u.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="font-bold">{u.name}</div>
            <div className="text-xs text-text-muted">{u.email}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'roles',
    header: 'Rôles',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.roles.map((r) => (
          <span
            key={r}
            className="rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted"
          >
            {r}
          </span>
        ))}
      </div>
    ),
  },
  {
    accessorKey: 'city',
    header: 'Ville',
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const m = STATUS_META[row.original.status];
      return (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
          {m.label}
        </span>
      );
    },
  },
  {
    accessorKey: 'ordersCount',
    header: 'Commandes',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.ordersCount}</span>
    ),
  },
  {
    accessorKey: 'listingsCount',
    header: 'Annonces',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.listingsCount}</span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <div className="flex items-center justify-end gap-1">
        <IconButton title="Envoyer un email">
          <Mail size={15} />
        </IconButton>
        <IconButton title="Suspendre" danger>
          <ShieldOff size={15} />
        </IconButton>
        <IconButton title="Plus">
          <MoreVertical size={15} />
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

export function UsersModule() {
  return (
    <DataTable<User, unknown>
      data={usersData}
      columns={columns}
      searchKey="name"
      searchPlaceholder="Rechercher par nom ou email…"
    />
  );
}
