import {
  ShoppingBag,
  Building2,
  Wallet,
  ShieldCheck,
  Compass,
  ScanFace,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  Icon: LucideIcon;
  title: string;
  body: string;
  tint: 'emerald' | 'saffron' | 'mint' | 'rose' | 'lilac' | 'info';
}

const FEATURES: Feature[] = [
  {
    Icon: ShoppingBag,
    title: 'Marketplace tout-en-un',
    body: 'Mode, électronique, beauté, auto. Vendeurs locaux et boutiques vérifiées dans tout le pays.',
    tint: 'emerald',
  },
  {
    Icon: Building2,
    title: 'Immobilier Conakry & régions',
    body: 'Location, vente, terrains. Visite vidéo, distance au goudron, et offres en un tap.',
    tint: 'saffron',
  },
  {
    Icon: Wallet,
    title: 'Wallet intégré',
    body: 'Recharge en Orange Money, MTN ou carte. Paye, encaisse, retire — sans quitter l\'app.',
    tint: 'mint',
  },
  {
    Icon: ShieldCheck,
    title: 'Escrow sécurisé',
    body: 'Le vendeur n\'est payé qu\'après ta confirmation de réception. Litige en 48 h.',
    tint: 'rose',
  },
  {
    Icon: Compass,
    title: 'Découvrir TikTok-style',
    body: 'Swipe verticalement entre annonces et logements. Le marché qui se feuillette.',
    tint: 'lilac',
  },
  {
    Icon: ScanFace,
    title: 'KYC en 3 minutes',
    body: 'Pièce d\'identité + selfie. Le badge "Vérifié" multiplie tes ventes par 3 en moyenne.',
    tint: 'info',
  },
];

const TINTS: Record<Feature['tint'], { bg: string; fg: string }> = {
  emerald: { bg: '#E8F2EE', fg: '#0F7256' },
  saffron: { bg: '#FCF1DC', fg: '#B5821C' },
  mint: { bg: '#E2F2EA', fg: '#198754' },
  rose: { bg: '#FBE7E5', fg: '#B53D2F' },
  lilac: { bg: '#ECE5F4', fg: '#634CA0' },
  info: { bg: '#E4ECF6', fg: '#2F5BBE' },
};

export function Features() {
  return (
    <section className="bg-bg-elev py-20 md:py-28" id="comment">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
            Tout dans une seule app
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
            Pensé pour la Guinée. Conçu pour les deux côtés du marché.
          </h2>
          <p className="mt-5 text-lg text-text-muted">
            Acheter, vendre, louer ou louer un bien : Linky tient debout sur
            trois piliers — la confiance, la simplicité, et le mobile-first.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const t = TINTS[f.tint];
            return (
              <div
                key={f.title}
                className="group rounded-3xl border border-border bg-card p-7 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]"
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: t.bg }}
                >
                  <f.Icon size={26} style={{ color: t.fg }} strokeWidth={1.75} />
                </div>
                <h3 className="font-display mt-6 text-xl font-bold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
