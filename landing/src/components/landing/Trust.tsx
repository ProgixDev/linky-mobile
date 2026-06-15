import { Lock, ShieldCheck, BadgeCheck, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Pillar {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    Icon: Lock,
    title: 'Paiement en escrow',
    body: 'L\'argent est gardé en séquestre tant que tu n\'as pas validé la réception.',
  },
  {
    Icon: BadgeCheck,
    title: 'KYC obligatoire',
    body: 'Tout vendeur identifié et tout agent immobilier avec pièce d\'identité vérifiée.',
  },
  {
    Icon: Scale,
    title: 'Litiges arbitrés en 48h',
    body: 'Une équipe de médiation locale tranche les désaccords, en français.',
  },
  {
    Icon: ShieldCheck,
    title: 'Données chiffrées',
    body: 'Conformité RGPD, données hébergées en datacenters certifiés ISO 27001.',
  },
];

function PartnerLogo({ name }: { name: string }) {
  // Color-coded mark per operator
  const map: Record<string, { bg: string; fg: string; abbr: string }> = {
    'Orange Money': { bg: '#FF7900', fg: '#fff', abbr: 'OM' },
    'MTN Mobile Money': { bg: '#FFC500', fg: '#0E1311', abbr: 'M' },
    Visa: { bg: '#1A1F71', fg: '#fff', abbr: 'V' },
    Mastercard: { bg: '#EB001B', fg: '#fff', abbr: 'MC' },
    Stripe: { bg: '#635BFF', fg: '#fff', abbr: 'S' },
    'Apple Pay': { bg: '#0E1311', fg: '#fff', abbr: 'A' },
  };
  const m = map[name] ?? { bg: '#0E1311', fg: '#fff', abbr: '?' };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg font-bold"
        style={{ background: m.bg, color: m.fg }}
      >
        {m.abbr}
      </div>
      <span className="text-sm font-bold text-[#0E1311]">{name}</span>
    </div>
  );
}

export function Trust() {
  return (
    <section className="bg-surface py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border border-line bg-[#F7F3EC] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Confiance
          </div>
          <h2 className="font-display mt-5 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl">
            Pourquoi des milliers de Guinéens nous confient leur argent.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-3xl border border-line bg-card p-7"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft">
                <p.Icon size={22} className="text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="font-display mt-5 text-lg font-bold tracking-tight">
                {p.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        {/* Partners */}
        <div className="mt-20">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-faint">
            Partenaires de paiement
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[
              'Orange Money',
              'MTN Mobile Money',
              'Visa',
              'Mastercard',
              'Stripe',
              'Apple Pay',
            ].map((p) => (
              <PartnerLogo key={p} name={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
