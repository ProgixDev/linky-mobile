import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Statut des services',
  description:
    'État en temps réel des services Linky : marketplace, wallet, paiement, support.',
};

type Status = 'operational' | 'degraded' | 'outage' | 'maintenance';

const SERVICES: { name: string; status: Status; sub?: string }[] = [
  { name: 'API Marketplace', status: 'operational' },
  { name: 'API Immobilier', status: 'operational' },
  { name: 'Wallet & paiements', status: 'operational' },
  { name: 'Orange Money', status: 'operational' },
  { name: 'MTN Mobile Money', status: 'operational' },
  { name: 'Carte bancaire (Stripe)', status: 'operational' },
  { name: 'Notifications push', status: 'operational' },
  { name: 'Recherche & catalogue', status: 'operational' },
  { name: 'App mobile (iOS & Android)', status: 'operational' },
  { name: 'Admin & back-office', status: 'operational' },
];

const HISTORY: { date: string; t: string; status: Status; resolved: boolean }[] = [
  {
    date: '12 mai 2026',
    t: 'Latence accrue sur les notifications push pendant 18 min',
    status: 'degraded',
    resolved: true,
  },
  {
    date: '28 avril 2026',
    t: 'Maintenance planifiée Orange Money (45 min)',
    status: 'maintenance',
    resolved: true,
  },
  {
    date: '14 avril 2026',
    t: 'Panne intermittente API Marketplace pendant 8 min',
    status: 'outage',
    resolved: true,
  },
];

const STATUS_META: Record<
  Status,
  { label: string; bg: string; fg: string; dot: string }
> = {
  operational: {
    label: 'Opérationnel',
    bg: '#E0F0E8',
    fg: '#155F45',
    dot: '#1FA971',
  },
  degraded: {
    label: 'Dégradé',
    bg: '#FCF1DC',
    fg: '#8B5A0A',
    dot: '#e8a53d',
  },
  outage: {
    label: 'Indisponible',
    bg: '#FBE7E5',
    fg: '#B53D2F',
    dot: '#D14F3C',
  },
  maintenance: {
    label: 'Maintenance',
    bg: '#E4ECF6',
    fg: '#2F5BBE',
    dot: '#3A7CA8',
  },
};

export default function StatusPage() {
  const anyDegraded = SERVICES.some((s) => s.status !== 'operational');

  return (
    <PageShell
      eyebrow="Statut · live"
      title={anyDegraded ? 'Quelques services à surveiller.' : 'Tout est opérationnel.'}
      subtitle="Mis à jour automatiquement toutes les 60 secondes. Pour s'abonner aux alertes : status@linky.gn"
    >
      {/* Global state banner */}
      <div
        className={`rounded-3xl p-8 ${
          anyDegraded
            ? 'bg-[#FCF1DC] ring-1 ring-[#e8a53d]/30'
            : 'bg-[#E0F0E8] ring-1 ring-[#1FA971]/25'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${
              anyDegraded ? 'bg-[#e8a53d]' : 'bg-[#1FA971]'
            }`}
          >
            {anyDegraded ? '⚠' : '✓'}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {anyDegraded
                ? 'Service partiellement perturbé'
                : 'Tous les services fonctionnent normalement'}
            </h2>
            <p className="mt-1 text-sm opacity-75">
              Dernière vérification il y a 14 secondes.
            </p>
          </div>
        </div>
      </div>

      {/* Services */}
      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Composants
      </h2>
      <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-[#E5DED1]">
        {SERVICES.map((s, i) => {
          const m = STATUS_META[s.status];
          return (
            <div
              key={s.name}
              className={`flex items-center gap-4 px-5 py-4 ${
                i < SERVICES.length - 1 ? 'border-b border-[#E5DED1]' : ''
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: m.dot }}
              />
              <span className="flex-1 font-medium">{s.name}</span>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: m.bg, color: m.fg }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* History */}
      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Incidents récents
      </h2>
      <div className="mt-4 space-y-2">
        {HISTORY.map((h) => {
          const m = STATUS_META[h.status];
          return (
            <div
              key={h.t}
              className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-[#E5DED1] sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="text-xs text-[#8C9590]">{h.date}</div>
              <div className="flex-1 text-sm font-medium">{h.t}</div>
              <span
                className="w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: m.bg, color: m.fg }}
              >
                {h.resolved ? 'Résolu' : m.label}
              </span>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
