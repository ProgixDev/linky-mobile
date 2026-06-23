'use client';

// Phase LIVREUR ONBOARDING — courier application review module.
//
// A DataTable of applications (Nom · Ville · Moyen de transport · Date ·
// Statut), filterable by status (default En attente) and searchable by name /
// phone / email. A row opens a right-side detail drawer with the personal
// info + the full questionnaire + the applicant's contact, and (for pending
// applications) the Accepter / Refuser bar — accept grants the 'livreur' role.

import { useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Loader2, Truck, X, Calendar, Phone, Mail, MapPin, Check, ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import {
  useLivreurApplications,
  useDecideLivreurApplication,
  type LivreurApplication,
  type LivreurApplicationStatus,
  type VehicleType,
} from '@/data/queries/livreur-applications';

const VEHICLE_LABEL: Record<VehicleType, string> = {
  moto: 'Moto',
  voiture: 'Voiture',
  velo: 'Vélo',
  a_pied: 'À pied',
};

const STATUS_META: Record<LivreurApplicationStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-accent-soft text-accent-text' },
  approved: { label: 'Approuvée', cls: 'bg-success/12 text-success' },
  rejected: { label: 'Refusée', cls: 'bg-danger/12 text-danger' },
};

const FILTERS: { value: LivreurApplicationStatus; label: string }[] = [
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvées' },
  { value: 'rejected', label: 'Refusées' },
];

type Row = LivreurApplication & { _search: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function LivreurApplicationsModule() {
  const [status, setStatus] = useState<LivreurApplicationStatus>('pending');
  const { data: applications, isLoading, isError } = useLivreurApplications(status);
  const [activeId, setActiveId] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () =>
      (applications ?? []).map((a) => ({
        ...a,
        _search: `${a.fullName} ${a.phone ?? ''} ${a.email ?? ''}`,
      })),
    [applications],
  );

  const active = rows.find((r) => r.id === activeId) ?? null;

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'fullName',
      header: 'Nom',
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-xs font-bold">
              {a.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">{a.fullName}</div>
              <div className="text-[11px] text-muted">{a.phone ?? a.email ?? '—'}</div>
            </div>
          </div>
        );
      },
    },
    { accessorKey: 'city', header: 'Ville', meta: { cellClassName: 'hidden md:table-cell' } },
    {
      id: 'vehicle',
      header: 'Moyen de transport',
      meta: { cellClassName: 'hidden lg:table-cell' },
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Truck size={14} className="text-muted" />
          {VEHICLE_LABEL[row.original.vehicleType] ?? row.original.vehicleType}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      meta: { cellClassName: 'hidden md:table-cell' },
      cell: ({ row }) => <span className="text-sm text-muted">{fmtDate(row.original.createdAt)}</span>,
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
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <button
            onClick={() => setActiveId(row.original.id)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:bg-sunken hover:text-[#0E1311]"
          >
            {row.original.status === 'pending' ? 'Examiner' : 'Voir'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Status filter */}
      <div className="flex w-fit gap-1 rounded-full bg-surface p-1.5 ring-1 ring-border">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setStatus(f.value);
              setActiveId(null);
            }}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
              status === f.value ? 'bg-black text-white' : 'text-muted hover:text-[#0E1311]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des candidatures…
        </div>
      ) : isError ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
          Impossible de charger les candidatures. Réessaie.
        </div>
      ) : (
        <DataTable<Row, unknown>
          data={rows}
          columns={columns}
          searchKey="_search"
          searchPlaceholder="Rechercher par nom ou téléphone…"
        />
      )}

      {active && (
        <ReviewDrawer
          key={active.id}
          application={active}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

function ReviewDrawer({ application, onClose }: { application: Row; onClose: () => void }) {
  const decide = useDecideLivreurApplication();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const a = application;
  const m = STATUS_META[a.status];
  const ans = a.answers ?? {};
  const zones = Array.isArray(ans.zones) ? ans.zones.join(', ') : (ans.zones ?? '—');

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Fermer le panneau" />
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col bg-surface shadow-[var(--shadow-pop)]"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-tight">{a.fullName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
                {m.label}
              </span>
              <span className="flex items-center gap-1 text-muted">
                <Calendar size={11} /> {fmtDate(a.createdAt)}
              </span>
            </div>
          </div>
          <button onClick={onClose} type="button" className="rounded-md p-1 text-muted hover:bg-sunken" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Contact */}
          <Section title="Coordonnées">
            <div className="space-y-2 text-sm">
              <Field icon={<Phone size={13} />} label="Téléphone" value={a.phone ?? '—'} />
              <Field icon={<Mail size={13} />} label="Email" value={a.email ?? '—'} />
              <Field icon={<MapPin size={13} />} label="Ville" value={a.city} />
              <Field icon={<Truck size={13} />} label="Moyen de transport" value={VEHICLE_LABEL[a.vehicleType] ?? a.vehicleType} />
            </div>
          </Section>

          {/* Questionnaire */}
          <Section title="Questionnaire">
            <div className="space-y-2.5 text-sm">
              <Field label="Zones couvertes" value={zones} />
              <Field label="Disponibilités" value={ans.availability ?? '—'} />
              <BoolField label="Permis / assurance" value={ans.has_license_insurance} />
              <BoolField label="Accepte le processus QR" value={ans.accepts_qr_process} />
              <BoolField label="Accepte les conditions Linky" value={ans.accepts_linky_terms} />
            </div>
            {a.idPhotoUrl && (
              <a
                href={a.idPhotoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <ShieldCheck size={13} /> Voir la pièce d’identité
              </a>
            )}
          </Section>

          {a.status === 'rejected' && a.rejectReason && (
            <Section title="Motif du refus">
              <div className="text-sm text-muted">{a.rejectReason}</div>
            </Section>
          )}

          {rejecting && (
            <Section title="Motif du refus (visible par le candidat)">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex. : pièce d’identité illisible, zone non couverte…"
                className="w-full resize-none rounded-xl border border-line bg-sunken/40 p-3 text-sm outline-none focus:border-primary"
              />
            </Section>
          )}
        </div>

        {/* Decision bar — only for pending applications */}
        {a.status === 'pending' && (
          <footer className="flex gap-3 border-t border-line p-4">
            {rejecting ? (
              <>
                <button
                  onClick={() => {
                    setRejecting(false);
                    setReason('');
                  }}
                  disabled={decide.isPending}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-sunken text-sm font-bold text-muted hover:bg-sunken/70 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={() =>
                    decide.mutate(
                      { application_id: a.id, decision: 'reject', reject_reason: reason.trim() },
                      { onSuccess: onClose },
                    )
                  }
                  disabled={decide.isPending || reason.trim().length === 0}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ flex: '1.5 1 0' }}
                >
                  {decide.isPending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} strokeWidth={2.25} />}
                  Confirmer le refus
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setRejecting(true)}
                  disabled={decide.isPending}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger/10 text-sm font-bold text-danger ring-1 ring-danger/25 hover:bg-danger/15 disabled:opacity-50"
                >
                  <X size={15} strokeWidth={2.25} /> Refuser
                </button>
                <button
                  onClick={() => decide.mutate({ application_id: a.id, decision: 'approve' }, { onSuccess: onClose })}
                  disabled={decide.isPending}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ flex: '1.5 1 0' }}
                >
                  {decide.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.25} />}
                  Accepter
                </button>
              </>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-faint">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Field({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function BoolField({ label, value }: { label: string; value?: boolean }) {
  const yes = value === true;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          yes ? 'bg-success/12 text-success' : 'bg-sunken text-muted'
        }`}
      >
        {yes ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        {yes ? 'Oui' : 'Non'}
      </span>
    </div>
  );
}
