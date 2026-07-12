'use client';

// Admin users table on real data. Suspend / reactivate added 2026-07-11
// (moderation). Role/email mutations still deferred.

import { type ColumnDef } from '@tanstack/react-table';
import { Ban, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { useAdminUsers, useSetUserStatus, type AdminUser } from '@/data/queries/users';

function SuspendButton({ user }: { user: AdminUser }) {
  const setStatus = useSetUserStatus();
  if (user.is_admin) return <span className="text-xs text-muted">—</span>;
  const suspended = user.status === 'suspended';
  const onClick = () => {
    const verb = suspended ? 'réactiver' : 'suspendre';
    if (!window.confirm(`Confirmer : ${verb} « ${user.display_name ?? 'cet utilisateur'} » ?`)) return;
    setStatus.mutate({ user_id: user.id, action: suspended ? 'reactivate' : 'suspend' });
  };
  return (
    <button
      onClick={onClick}
      disabled={setStatus.isPending}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${
        suspended
          ? 'bg-primary-soft text-primary-deep hover:bg-primary-soft/70'
          : 'bg-danger/10 text-danger ring-1 ring-danger/25 hover:bg-danger/15'
      }`}
    >
      {suspended ? <RotateCcw size={12} /> : <Ban size={12} />}
      {suspended ? 'Réactiver' : 'Suspendre'}
    </button>
  );
}

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
      const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
      return (
        <div className="flex items-center gap-3">
          {u.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, no next/image domain config needed
            <img
              src={u.avatar_url}
              alt=""
              className="h-9 w-9 rounded-full bg-sunken object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-xs font-bold">
              {initials}
            </div>
          )}
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
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) =>
      row.original.status === 'suspended' ? (
        <span className="rounded-full bg-danger/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-danger">
          Suspendu
        </span>
      ) : row.original.status === 'deleted' ? (
        <span className="rounded-full bg-sunken px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
          Supprimé
        </span>
      ) : (
        <span className="rounded-full bg-success/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
          Actif
        </span>
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
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <SuspendButton user={row.original} />,
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
