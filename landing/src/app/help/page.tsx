import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Centre d\'aide',
  description: 'Réponses aux questions fréquentes. Comment acheter, vendre, payer, livrer.',
};

const TOPICS = [
  {
    t: 'Premiers pas',
    d: 'Créer ton compte, vérifier ton identité, configurer le wallet.',
  },
  {
    t: 'Acheter',
    d: 'Trouver un produit, payer en sécurité, recevoir et confirmer.',
  },
  {
    t: 'Vendre',
    d: 'Publier une annonce, booster, gérer les commandes, encaisser.',
  },
  {
    t: 'Immobilier',
    d: 'Trouver un logement, demander une visite, faire une offre.',
  },
  {
    t: 'Wallet & paiements',
    d: 'Recharge, retrait, frais, Mobile Money et carte bancaire.',
  },
  {
    t: 'Litiges & remboursements',
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
      subtitle="Les réponses aux questions les plus fréquentes, en français."
    >
      {/* Top questions */}
      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Questions populaires
      </h2>
      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {/* Ces huit questions pointaient toutes sur « # » : il n'existe aucune
            route d'article. La FAQ de l'accueil est le seul endroit du site qui
            porte de vraies réponses — on y renvoie plutôt que de simuler un
            lien qui ne mène nulle part. */}
        {TOP_QUESTIONS.map((q) => (
          <a
            key={q}
            href="/#faq"
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
          <div
            key={t.t}
            className="block rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1]"
          >
            <h3 className="font-display mt-2 text-lg font-bold tracking-tight">
              {t.t}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5e6864]">{t.d}</p>
          </div>
        ))}
      </div>

      {/* CTA contact */}
      <div className="mt-16 grid gap-6 rounded-3xl bg-[#0E1311] p-8 text-white md:grid-cols-2 md:p-10">
        <div>
          <h3 className="font-display text-2xl font-bold tracking-tight">
            Tu ne trouves pas ?
          </h3>
          <p className="mt-2 max-w-md text-white/70">
            Écris-nous, on te répond en français.
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
            support@linkygroup.com
          </span>
        </div>
      </div>
    </PageShell>
  );
}
