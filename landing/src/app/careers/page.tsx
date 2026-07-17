import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Carrières',
  description:
    'Construis Linky avec nous. Postes ouverts à Conakry, Paris, en remote.',
};

interface Job {
  title: string;
  team: string;
  location: string;
  type: string;
}

const JOBS: Job[] = [
  {
    title: 'Senior React Native Engineer',
    team: 'Engineering · Mobile',
    location: 'Conakry / Paris',
    type: 'CDI',
  },
  {
    title: 'Backend Engineer (Node / Postgres)',
    team: 'Engineering · Platform',
    location: 'Remote (UTC ±2h)',
    type: 'CDI',
  },
  {
    title: 'Designer Produit',
    team: 'Design',
    location: 'Conakry / Dakar',
    type: 'CDI',
  },
  {
    title: 'Trust & Safety Operations Lead',
    team: 'Operations',
    location: 'Conakry',
    type: 'CDI',
  },
  {
    title: 'Account Manager (Diaspora)',
    team: 'Business',
    location: 'Paris / Bruxelles',
    type: 'CDI',
  },
];

const PERKS = [
  'Salaire au-dessus du marché local',
  'Stock-options pour tous',
  '4 semaines de congés + ponts généreux',
  'Budget équipement : Mac + écran 27"',
  'Remote partiel : 3 jours bureau, 2 jours libre',
  'Budget formation : 1 500 € / an',
  'Healthcare premium (Allianz)',
  'Voyage d\'équipe annuel',
];

export default function CareersPage() {
  return (
    <PageShell
      eyebrow="On recrute"
      title="Construis Linky avec nous."
      subtitle="On cherche des gens qui veulent transformer le commerce et l'immobilier d'Afrique de l'Ouest. Petites équipes, gros impact."
    >
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 rounded-3xl bg-[#0E1311] p-8 text-white md:grid-cols-4 md:p-10">
        {[
          { n: 'Conakry', l: 'Siège' },
          { n: '2026', l: 'Lancement' },
          { n: 'FR', l: 'Langue de travail' },
          { n: 'Remote OK', l: 'Selon le poste' },
        ].map((s) => (
          <div key={s.l}>
            <div className="font-display text-3xl font-bold tracking-tight">
              {s.n}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-white/55">
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* Open positions */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Postes ouverts.
      </h2>
      <div className="mt-8 space-y-3">
        {JOBS.map((j) => (
          <a
            key={j.title}
            href={`mailto:jobs@linkygroup.com?subject=${encodeURIComponent(`Candidature — ${j.title}`)}`}
            className="flex items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#E5DED1] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(14,19,17,0.15)] md:p-6"
          >
            <div className="flex-1">
              <h3 className="font-display text-lg font-bold tracking-tight">
                {j.title}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#5e6864]">
                <span>{j.team}</span>
                <span className="h-1 w-1 rounded-full bg-[#D4CCBA]" />
                <span>{j.location}</span>
                <span className="rounded-full bg-[#E8F2EE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A5240]">
                  {j.type}
                </span>
              </div>
            </div>
            <div className="text-sm font-bold text-[#0e6e55]">Postuler →</div>
          </a>
        ))}
      </div>

      {/* Perks */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Ce qu&apos;on offre.
      </h2>
      <div className="mt-8 grid gap-2 md:grid-cols-2">
        {PERKS.map((p) => (
          <div
            key={p}
            className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-[#E5DED1]"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0e6e55] text-xs font-bold text-white">
              ✓
            </div>
            <span className="text-sm font-medium">{p}</span>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-3xl bg-[#E8F2EE] p-8 md:p-10">
        <h3 className="font-display text-2xl font-bold tracking-tight text-[#0A5240]">
          Pas de poste qui correspond ?
        </h3>
        <p className="mt-3 max-w-md text-[#0A5240]/80">
          On garde toujours un œil sur les profils qu&apos;on devrait
          embaucher. Envoie-nous un mot.
        </p>
        <a
          href="mailto:jobs@linkygroup.com"
          className="mt-5 inline-block rounded-xl bg-[#0e6e55] px-5 py-3 text-sm font-bold text-white hover:opacity-90"
        >
          jobs@linkygroup.com
        </a>
      </div>
    </PageShell>
  );
}
