'use client';

// Final sprint §2 — overview on real counts (admin-overview fn). Numbers
// only : no chart and no growth deltas until there's real history to plot —
// an honest small number beats a fictional trend line.

import { Wallet, ShoppingBag, Users, CircleAlert, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useAdminOverview } from '@/data/queries/overview';

export function Overview() {
  const { data: o, isLoading, isError } = useAdminOverview();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" /> Chargement des indicateurs…
      </div>
    );
  }
  if (isError || !o) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-surface text-sm text-danger">
        Impossible de charger les indicateurs. Réessaie.
      </div>
    );
  }

  const ordersInFlight = o.orders_paid + o.orders_preparing + o.orders_delivered;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          Icon={Wallet}
          label="Volume d'affaires (GMV)"
          value={`${(o.gmv_minor / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M GNF`}
        />
        <KPICard Icon={ShoppingBag} label="Commandes" value={o.orders_total.toLocaleString('fr-FR')} />
        <KPICard Icon={Users} label="Utilisateurs" value={o.users_count.toLocaleString('fr-FR')} />
        <KPICard Icon={CircleAlert} label="Litiges ouverts" value={String(o.orders_disputed)} />
      </div>

      {/* Work queues + order pipeline */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            À traiter en priorité
          </div>
          <div className="mt-4 space-y-3">
            <PriorityRow href="/orders" label="Litiges ouverts" count={o.orders_disputed} accent />
            <PriorityRow href="/kyc" label="KYC à valider" count={o.kyc_pending} />
            <PriorityRow href="/withdrawals" label="Retraits en attente" count={o.withdrawals_pending} accent />
            <PriorityRow href="/listings" label="Annonces en attente" count={o.listings_pending} />
          </div>
        </Card>

        <Card>
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            Pipeline commandes
          </div>
          <div className="mt-4 space-y-3">
            <PriorityRow href="/orders" label="Payées / en préparation / livrées" count={ordersInFlight} />
            <PriorityRow href="/orders" label="Terminées (fonds libérés)" count={o.orders_released} />
            <PriorityRow href="/orders" label="Annulées" count={o.orders_cancelled} />
            <PriorityRow href="/orders" label="Remboursées" count={o.orders_refunded} />
          </div>
          <div className="mt-4 text-xs text-faint">
            Annonces en ligne : {o.listings_active.toLocaleString('fr-FR')}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      {children}
    </div>
  );
}

function KPICard({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunken">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="mt-5 text-xs font-bold uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="font-display mt-1 text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
    </Card>
  );
}

function PriorityRow({
  href,
  label,
  count,
  accent,
}: {
  href: string;
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-line bg-surface/40 px-3 py-3 transition-colors hover:bg-sunken"
    >
      <span className="text-sm font-semibold text-[#0E1311]">{label}</span>
      <span
        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2.5 text-sm font-bold tabular-nums ${
          accent && count > 0 ? 'bg-accent text-[#0E1311]' : 'bg-sunken text-muted'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
