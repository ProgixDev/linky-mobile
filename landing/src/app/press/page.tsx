import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Presse',
  description:
    'Kit presse Linky : logos, captures d\'écran, faits clés, contact relations presse.',
};

// Facts kept strictly verifiable — no invented metrics, founders, or rounds.
const FACTS = [
  { l: 'Siège', v: 'Conakry, Guinée' },
  { l: 'Lancement', v: '2026' },
  { l: 'Produit', v: 'Marketplace + immobilier' },
  { l: 'Paiement', v: 'Mobile Money & carte, séquestre intégré' },
  { l: 'Confiance', v: 'Vendeurs vérifiés (KYC)' },
  { l: 'Langue', v: 'Français' },
];

export default function PressPage() {
  return (
    <PageShell
      eyebrow="Presse & médias"
      title="Tout ce qu'il faut pour parler de Linky."
      subtitle="Logos officiels, captures d'écran haute résolution, faits clés et contact direct. Servez-vous."
    >
      {/* Quick contact */}
      <div className="rounded-3xl bg-[#0E1311] p-8 text-white md:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Contact relations presse
            </h2>
            <p className="mt-2 max-w-md text-white/70">
              On répond en moins de 24 h en semaine, en français ou en anglais.
            </p>
          </div>
          <a
            href="mailto:press@linkygroup.com"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#e8a53d] px-6 text-sm font-bold text-[#0E1311] hover:opacity-90"
          >
            press@linkygroup.com
          </a>
        </div>
      </div>

      {/* Facts */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Faits clés.
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {FACTS.map((f) => (
          <div
            key={f.l}
            className="rounded-2xl bg-white p-5 ring-1 ring-[#E5DED1]"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8C9590]">
              {f.l}
            </div>
            <div className="mt-1 text-lg font-bold text-[#0E1311]">{f.v}</div>
          </div>
        ))}
      </div>

      {/* Brand kit */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Kit de marque.
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { t: 'Logos (SVG + PNG)', s: 'Versions claire et foncée, monochrome.' },
          { t: 'Captures écran', s: 'Captures HD : home, marketplace, KYC.' },
          { t: 'Faits & visuels', s: 'Dossier complet, mis à jour au lancement.' },
        ].map((k) => (
          <a
            key={k.t}
            href="mailto:press@linkygroup.com?subject=Kit%20de%20marque%20Linky"
            className="block rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(14,19,17,0.15)]"
          >
            <h3 className="font-display text-lg font-bold tracking-tight">
              {k.t}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5e6864]">{k.s}</p>
            <div className="mt-4 text-xs font-bold text-[#0e6e55]">
              Sur demande →
            </div>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
