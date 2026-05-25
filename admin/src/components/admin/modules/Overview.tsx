'use client';

import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingBag,
  Users,
  CircleAlert,
  ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { overviewKpis, ordersData, kycData, disputesData } from '@/data/mock';

const REV_DATA = [
  { d: 'Jan', v: 92 },
  { d: 'Fév', v: 108 },
  { d: 'Mar', v: 124 },
  { d: 'Avr', v: 142 },
  { d: 'Mai', v: 184 },
  { d: 'Juin', v: 168 },
  { d: 'Juil', v: 196 },
  { d: 'Août', v: 210 },
  { d: 'Sep', v: 244 },
  { d: 'Oct', v: 268 },
  { d: 'Nov', v: 296 },
  { d: 'Déc', v: 312 },
];

export function Overview() {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          Icon={Wallet}
          label="Revenus 30 j"
          value={`${(overviewKpis.revenue / 1_000_000).toFixed(1)} M GNF`}
          delta={overviewKpis.revenueDelta}
          trend="up"
        />
        <KPICard
          Icon={ShoppingBag}
          label="Commandes"
          value={String(overviewKpis.orders)}
          delta={overviewKpis.ordersDelta}
          trend="up"
        />
        <KPICard
          Icon={Users}
          label="Utilisateurs"
          value={overviewKpis.users.toLocaleString('fr-FR')}
          delta={overviewKpis.usersDelta}
          trend="up"
        />
        <KPICard
          Icon={CircleAlert}
          label="Litiges ouverts"
          value={String(overviewKpis.disputes)}
          delta={overviewKpis.disputesDelta}
          trend="down"
        />
      </div>

      {/* Chart + side */}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
                Revenus 12 mois
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-3xl font-bold">
                  2 524 M{' '}
                  <span className="text-base font-semibold text-text-muted">
                    GNF
                  </span>
                </span>
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-bold text-primary-deep">
                  <ArrowUpRight size={11} strokeWidth={2.5} />
                  +24 %
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REV_DATA}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0E6E55" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#0E6E55" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="d"
                  stroke="var(--text-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--text-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v} M`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--text-faint)' }}
                  formatter={(value) => [`${value} M GNF`, 'Revenus']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#0E6E55"
                  strokeWidth={2.5}
                  fill="url(#gradRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
            À traiter en priorité
          </div>
          <div className="mt-4 space-y-3">
            <PriorityRow
              label="Litiges en examen"
              count={disputesData.filter((d) => d.column === 'received' || d.column === 'reviewing').length}
              accent
            />
            <PriorityRow
              label="KYC à valider"
              count={kycData.filter((k) => k.status === 'pending').length}
            />
            <PriorityRow
              label="Annonces signalées"
              count={3}
            />
            <PriorityRow
              label="Commandes en retard"
              count={2}
              accent
            />
          </div>
        </Card>
      </div>

      {/* Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
              Dernières commandes
            </div>
            <a href="/orders" className="text-xs font-bold text-primary">
              Voir tout →
            </a>
          </div>
          <div className="mt-4 space-y-2">
            {ordersData.slice(0, 5).map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-elev/40 px-3 py-2.5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-sunken text-[10px] font-bold text-text-muted">
                  {o.ref.slice(-3)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{o.product}</div>
                  <div className="text-xs text-text-muted">
                    {o.buyer} · {o.seller}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums">
                  {(o.totalGnf / 1000).toFixed(0)} k
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
              KYC en attente
            </div>
            <a href="/kyc" className="text-xs font-bold text-primary">
              Voir tout →
            </a>
          </div>
          <div className="mt-4 space-y-2">
            {kycData
              .filter((k) => k.status === 'pending')
              .slice(0, 5)
              .map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg-elev/40 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-sunken text-[11px] font-bold text-text-muted">
                    {k.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{k.name}</div>
                    <div className="text-xs text-text-muted">{k.docType}</div>
                  </div>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-text">
                    {k.role}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elev p-6">
      {children}
    </div>
  );
}

function KPICard({
  Icon,
  label,
  value,
  delta,
  trend,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;
  const tint = trend === 'up' ? 'text-success' : 'text-danger';
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-sunken">
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${tint}`}>
          <TrendIcon size={12} strokeWidth={2.5} />
          {delta}
        </span>
      </div>
      <div className="mt-5 text-xs font-bold uppercase tracking-wider text-text-faint">
        {label}
      </div>
      <div className="font-display mt-1 text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
    </Card>
  );
}

function PriorityRow({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-bg-elev/40 px-3 py-3">
      <span className="text-sm font-semibold text-text">{label}</span>
      <span
        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2.5 text-sm font-bold tabular-nums ${
          accent ? 'bg-accent text-text' : 'bg-bg-sunken text-text-muted'
        }`}
      >
        {count}
      </span>
    </div>
  );
}
