'use client';

// Phase LIVREUR ASSIGNMENT — admin central dispatch.
//
// Two views:
//   « À assigner » — unassigned deliveries → « Assigner un livreur » opens a
//     picker of approved livreurs (nom · ville · moyen de transport · nb
//     livraisons en cours) → confirm assigns + notifies the livreur.
//   « En cours »   — assigned / in_transit deliveries with a « Réassigner »
//     action (same picker).

import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Loader2, Truck, X, Check, MapPin, Package, UserCheck } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import {
  useAdminDeliveries,
  useAdminLivreurs,
  useAssignDelivery,
  type AdminDelivery,
  type AdminLivreur,
  type DeliveryStatus,
} from '@/data/queries/deliveries';

const VEHICLE_LABEL: Record<NonNullable<AdminLivreur['vehicleType']>, string> = {
  moto: 'Moto',
  voiture: 'Voiture',
  velo: 'Vélo',
  a_pied: 'À pied',
};

const STATUS_META: Partial<Record<DeliveryStatus, { label: string; cls: string }>> = {
  unassigned: { label: 'À assigner', cls: 'bg-sunken text-muted' },
  assigned: { label: 'Assigné', cls: 'bg-accent-soft text-accent-text' },
  in_transit: { label: 'En transit', cls: 'bg-primary-soft text-primary-deep' },
};

type Tab = 'aassigner' | 'encours';
type Row = AdminDelivery & { _search: string };

function addressOf(d: AdminDelivery): string {
  const a = d.deliveryAddress;
  return a?.city ?? d.order?.buyerCity ?? a?.label ?? a?.district ?? '—';
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DeliveriesModule() {
  const [tab, setTab] = useState<Tab>('aassigner');
  const [picker, setPicker] = useState<AdminDelivery | null>(null);

  const unassigned = useAdminDeliveries('unassigned', tab === 'aassigner');
  const assigned = useAdminDeliveries('assigned', tab === 'encours');
  const inTransit = useAdminDeliveries('in_transit', tab === 'encours');

  const isLoading = tab === 'aassigner' ? unassigned.isLoading : assigned.isLoading || inTransit.isLoading;
  const isError = tab === 'aassigner' ? unassigned.isError : assigned.isError || inTransit.isError;

  const rows: Row[] = useMemo(() => {
    const base =
      tab === 'aassigner'
        ? unassigned.data ?? []
        : [...(assigned.data ?? []), ...(inTransit.data ?? [])].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
    return base.map((d) => ({
      ...d,
      _search: `${d.order?.reference ?? ''} ${d.order?.productSnapshot?.title ?? ''} ${addressOf(d)}`,
    }));
  }, [tab, unassigned.data, assigned.data, inTransit.data]);

  const columns: ColumnDef<Row>[] = [
    {
      id: 'reference',
      header: 'Réf. commande',
      cell: ({ row }) => <span className="font-bold tabular-nums">{row.original.order?.reference ?? '—'}</span>,
    },
    {
      id: 'address',
      header: 'Ville / adresse',
      meta: { cellClassName: 'hidden md:table-cell' },
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <MapPin size={13} className="text-muted" />
          {addressOf(row.original)}
        </span>
      ),
    },
    {
      id: 'product',
      header: 'Produit',
      meta: { cellClassName: 'hidden lg:table-cell' },
      cell: ({ row }) => (
        <div className="max-w-[240px] truncate text-sm">{row.original.order?.productSnapshot?.title ?? '—'}</div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      meta: { cellClassName: 'hidden md:table-cell' },
      cell: ({ row }) => <span className="text-sm text-muted">{fmtDate(row.original.createdAt)}</span>,
    },
    ...(tab === 'encours'
      ? ([
          {
            id: 'livreur',
            header: 'Livreur',
            cell: ({ row }) => {
              const m = STATUS_META[row.original.status];
              return (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{row.original.assignedLivreur?.name ?? '—'}</span>
                  {m && (
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
                      {m.label}
                    </span>
                  )}
                </div>
              );
            },
          },
        ] as ColumnDef<Row>[])
      : []),
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <button
            onClick={() => setPicker(row.original)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
          >
            <Truck size={13} />
            {tab === 'aassigner' ? 'Assigner un livreur' : 'Réassigner'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-full bg-surface p-1.5 ring-1 ring-border">
        <TabBtn label="À assigner" active={tab === 'aassigner'} onClick={() => setTab('aassigner')} />
        <TabBtn label="En cours" active={tab === 'encours'} onClick={() => setTab('encours')} />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des livraisons…
        </div>
      ) : isError ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
          Impossible de charger les livraisons. Réessaie.
        </div>
      ) : (
        <DataTable<Row, unknown>
          data={rows}
          columns={columns}
          searchKey="_search"
          searchPlaceholder="Rechercher par référence ou produit…"
        />
      )}

      {picker && <LivreurPicker delivery={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function LivreurPicker({ delivery, onClose }: { delivery: AdminDelivery; onClose: () => void }) {
  const { data: livreurs, isLoading, isError } = useAdminLivreurs(true);
  const assign = useAssignDelivery();
  const [selected, setSelected] = useState<string | null>(delivery.assignedLivreur?.id ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <div className="font-display text-lg font-bold">Assigner un livreur</div>
            <div className="mt-0.5 text-xs text-muted">
              Commande {delivery.order?.reference ?? '—'} · {addressOf(delivery)}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted">
              <Loader2 size={15} className="mr-2 animate-spin" /> Chargement des livreurs…
            </div>
          ) : isError ? (
            <div className="flex h-32 items-center justify-center text-sm text-danger">
              Impossible de charger les livreurs.
            </div>
          ) : (livreurs ?? []).length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-sm text-muted">
              <UserCheck size={20} className="text-faint" />
              Aucun livreur approuvé pour l’instant.
              <span className="text-xs text-faint">Validez d’abord une candidature dans « Candidatures livreurs ».</span>
            </div>
          ) : (
            (livreurs ?? []).map((l) => {
              const isSel = selected === l.id;
              const isCurrent = delivery.assignedLivreur?.id === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelected(l.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    isSel ? 'border-primary bg-primary-soft' : 'border-line bg-sunken/40 hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-xs font-bold">
                      {(l.name ?? 'Livreur').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">{l.name ?? 'Livreur Linky'}</span>
                        {isCurrent && (
                          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-text">
                            actuel
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={10} /> {l.city ?? '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck size={10} /> {l.vehicleType ? VEHICLE_LABEL[l.vehicleType] : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Package size={10} /> {l.activeDeliveries} en cours
                        </span>
                      </div>
                    </div>
                    {isSel && <Check size={16} className="shrink-0 text-primary" strokeWidth={2.5} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <footer className="flex gap-3 border-t border-line p-4">
          <button
            onClick={onClose}
            disabled={assign.isPending}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              if (!selected) return;
              assign.mutate({ delivery_id: delivery.id, livreur_id: selected }, { onSuccess: onClose });
            }}
            disabled={assign.isPending || !selected || selected === delivery.assignedLivreur?.id}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            style={{ flex: '1.5 1 0' }}
          >
            {assign.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.25} />}
            Confirmer l’assignation
          </button>
        </footer>
      </div>
    </div>
  );
}
