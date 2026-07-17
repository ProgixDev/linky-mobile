import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Centre d\'aide',
  description: 'Réponses aux questions fréquentes. Comment acheter, vendre, payer, livrer.',
};

const TOPICS = [
  {
    t: 'Premiers pas',
    n: 12,
    d: 'Créer ton compte, vérifier ton identité, configurer le wallet.',
  },
  {
    t: 'Acheter',
    n: 18,
    d: 'Trouver un produit, payer en sécurité, recevoir et confirmer.',
  },
  {
    t: 'Vendre',
    n: 22,
    d: 'Publier une annonce, booster, gérer les commandes, encaisser.',
  },
  {
    t: 'Immobilier',
    n: 15,
    d: 'Trouver un logement, demander une visite, faire une offre.',
  },
  {
    t: 'Wallet & paiements',
    n: 14,
    d: 'Recharge, retrait, frais, Mobile Money et carte bancaire.',
  },
  {
    t: 'Litiges & remboursements',
    n: 9,
    d: 'Ouvrir un litige, comment fonctionne la médiation.',
  },
];

const TOP_QUESTIONS = [
  'Comment fonctionne le paiement sécurisé (escrow) ?',
  'Que faire si l\'article reçu ne correspond pas ?',
  'Combien coûtent les frais de transaction ?',
  'Comment retirer l\'argent de mon wallet ?',
  'Comment devenir vendeur vérifié ?',
  'L\'app est-elle disponible pour la diaspora ?',
  'Quels sont les modes de paiement acceptés ?',
  'Comment annuler une commande ?',
];

export default function HelpPage() {
  return (
    <PageShell
      eyebrow="Support"
      title="Centre d'aide."
      subtitle="Toutes les réponses pour utiliser Linky en confiance. Plus de 90 articles, en français, mis à jour chaque semaine."
    >
      {/* Search */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E5DED1]">
        <div className="flex h-12 items-center gap-3 rounded-xl bg-[#EFE8DA] px-4">
          <span className="text-[#5e6864]">🔍</span>
          <input
            placeholder="Cherche une réponse — ex. « comment retirer mon argent »"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#8C9590]"
          />
        </div>
      </div>

      {/* Top questions */}
      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Questions populaires
      </h2>
      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {TOP_QUESTIONS.map((q) => (
          <a
            key={q}
            href="#"
            className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-[#E5DED1] hover:ring-[#0e6e55]/50"
          >
            <span className="text-sm font-medium">{q}</span>
            <span className="text-[#0e6e55]">→</span>
          </a>
        ))}
      </div>

      {/* Topics */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Parcourir par thème.
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOPICS.map((t) => (
          <a
            key={t.t}
            href="#"
            className="block rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(14,19,17,0.15)]"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-[#8C9590]">
              {t.n} articles
            </div>
            <h3 className="font-display mt-2 text-lg font-bold tracking-tight">
              {t.t}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5e6864]">{t.d}</p>
          </a>
        ))}
      </div>

      {/* CTA contact */}
      <div className="mt-16 grid gap-6 rounded-3xl bg-[#0E1311] p-8 text-white md:grid-cols-2 md:p-10">
        <div>
          <h3 className="font-display text-2xl font-bold tracking-tight">
            Tu ne trouves pas ?
          </h3>
          <p className="mt-2 max-w-md text-white/70">
            Notre équipe support répond en moyenne en moins d&apos;une heure,
            en français.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end md:justify-center">
          <a
            href="/contact"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#e8a53d] px-6 text-sm font-bold text-[#0E1311] hover:opacity-90"
          >
            Contacter l&apos;équipe
          </a>
          <span className="text-xs text-white/55">
            support@linkygroup.com · +224 622 00 00 00
          </span>
        </div>
      </div>
    </PageShell>
  );
}
