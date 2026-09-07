import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Sécurité',
  description:
    'Comment Linky protège ton compte, tes données et tes paiements.',
};

const PILLARS = [
  {
    n: '01',
    t: 'Paiement en escrow',
    d: 'Chaque paiement est gardé en séquestre par Linky. Le vendeur n\'est crédité qu\'après ta confirmation de réception.',
  },
  {
    n: '02',
    t: 'Vérification d\'identité',
    d: 'Un vendeur peut vérifier son identité (pièce d\'identité + selfie) via notre prestataire, et obtenir le badge « Vérifié ».',
  },
  {
    n: '03',
    t: 'Données chiffrées',
    d: 'Chiffrement en transit et au repos, assuré par notre hébergeur cloud européen.',
  },
  {
    n: '04',
    t: 'Pas de stockage de cartes',
    d: 'Les numéros de carte ne touchent jamais nos serveurs : la saisie se fait chez notre prestataire de paiement — Lengopay pour les cartes en Guinée, Stripe depuis l\'étranger.',
  },
  {
    n: '05',
    t: 'Connexion par code à usage unique',
    d: 'Chaque connexion est confirmée par un code envoyé sur ton téléphone ou par email.',
  },
  {
    n: '06',
    t: 'Revues de sécurité',
    d: 'Le code et l\'infrastructure sont relus régulièrement, avec des audits adverses avant chaque mise en production sensible.',
  },
];

export default function SecurityPage() {
  return (
    <PageShell
      eyebrow="Sécurité"
      title="On prend ta sécurité au sérieux."
      subtitle="Six piliers pour protéger ton compte, tes données et chaque transaction. Si tu trouves une faille, on te récompense."
    >
      {/* Pillars */}
      <div className="grid gap-4 md:grid-cols-2">
        {PILLARS.map((p) => (
          <div
            key={p.n}
            className="rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1]"
          >
            <div className="font-display text-sm font-bold text-[#0e6e55]">
              {p.n}
            </div>
            <h3 className="font-display mt-2 text-lg font-bold tracking-tight">
              {p.t}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5e6864]">
              {p.d}
            </p>
          </div>
        ))}
      </div>

      {/* Bug bounty */}
      <div className="mt-16 rounded-3xl bg-[#0E1311] p-8 text-white md:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#e8a53d]">
              Programme bug bounty
            </div>
            <h2 className="font-display mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              Tu trouves une faille ? Écris-nous.
            </h2>
            <p className="mt-3 max-w-md text-white/70">
              Nous étudions chaque signalement et convenons avec toi des
              modalités de publication. Décris la faille, comment la
              reproduire, et ce qu\'elle permet.
            </p>
          </div>
          <a
            href="mailto:security@linkygroup.com"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#e8a53d] px-6 text-sm font-bold text-[#0E1311] hover:opacity-90"
          >
            security@linkygroup.com
          </a>
        </div>
      </div>

      {/* Compromised account */}
      <h2 className="font-display mt-16 text-2xl font-bold tracking-tight">
        Mon compte est compromis — que faire ?
      </h2>
      <ol className="mt-6 space-y-3">
        {[
          'Change immédiatement ton mot de passe (Profil → Modifier mon profil).',
          'Contacte support@linkygroup.com en précisant ton numéro de téléphone.',
        ].map((s, i) => (
          <li
            key={s}
            className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-[#E5DED1]"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0e6e55] text-xs font-bold text-white">
              {i + 1}
            </div>
            <span className="text-sm leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
