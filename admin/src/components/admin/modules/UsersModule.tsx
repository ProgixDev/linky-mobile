'use client';

// Final sprint §2 — users table on real data. READ-ONLY in V1 : no suspend /
// email / role mutations until a moderation policy exists.

import { type ColumnDef } from '@tanstack/react-table';
import { Loader2, ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { useAdminUsers, type AdminUser } from '@/data/queries/users';

const KYC_META: Record<AdminUser['kyc_status'], { label: string; cls: string }> = {
  approved: { label: 'Vérifié', cls: 'bg-success/12 text-success' },
  pending: { label: 'KYC en cours', cls: 'bg-accent-soft text-accent-text' },
  in_review: { label: 'KYC en examen', cls: 'bg-accent-soft text-accent-text' },
  declined: { label: 'KYC refusé', cls: 'bg-danger/12 text-danger' },
  none: { label: 'Non vérifié', cls: 'bg-sunken text-muted' },
};

const columns: ColumnDef<AdminUser>[] = [
  {
    id: 'display_name',
    accessorFn: (u) => u.display_name ?? '',
    header: 'Utilisateur',
    cell: ({ row }) => {
      const u = row.original;
      const name = u.display_name ?? 'Utilisateur Linky';
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-xs font-bold">
            {name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-bold">{name}</div>
            <div className="text-xs text-muted tabular-nums">{u.id.slice(0, 8)}…</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'kyc_status',
    header: 'KYC',
    cell: ({ row }) => {
      const m = KYC_META[row.original.kyc_status] ?? KYC_META.none;
      return (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
          {m.label}
        </span>
      );
    },
  },
  {
    accessorKey: 'is_admin',
    header: 'Rôle',
    meta: { cellClassName: 'hidden md:table-cell' },
    cell: ({ row }) =>
      row.original.is_admin ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
          <ShieldCheck size={10} /> Admin
        </span>
      ) : (
        <span className="text-xs text-muted">Membre</span>
      ),
  },
  {
    accessorKey: 'created_at',
    header: 'Inscrit le',
    meta: { cellClassName: 'hidden lg:table-cell' },
    cell: ({ row }) =>
      new Date(row.original.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
  },
];

export function UsersModule() {
  const { data: users, isLoading, isError } = useAdminUsers();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des utilisateurs…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
        Impossible de charger les utilisateurs. Réessaie.
      </div>
    );
  }

  return (
    <DataTable<AdminUser, unknown>
      data={users ?? []}
      columns={columns}
      searchKey="display_name"
      searchPlaceholder="Rechercher par nom…"
    />
  );
}
