'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Comment fonctionne le paiement sécurisé ?',
    a: 'Quand tu achètes, ton paiement est gardé en escrow par Linky. Le vendeur n\'est crédité qu\'après ta confirmation de réception. Tu as 48 h pour confirmer ou ouvrir un litige.',
  },
  {
    q: 'Quels moyens de paiement sont acceptés ?',
    a: 'Orange Money, MTN Mobile Money, Visa, Mastercard, Apple Pay et Google Pay. Tu peux aussi utiliser le solde de ton wallet Linky.',
  },
  {
    q: 'Combien coûtent les frais ?',
    a: 'Linky prélève une commission transparente sur chaque transaction réussie. Aucun frais caché — le montant t\'est toujours indiqué avant validation. Les versements vers Mobile Money sont gratuits.',
  },
  {
    q: 'Que se passe-t-il en cas de problème avec un vendeur ?',
    a: 'Tu ouvres un litige directement dans la commande. Notre équipe de médiation intervient en 48 h pour proposer une résolution : remboursement, retour ou contrepartie.',
  },
  {
    q: 'L\'app est-elle disponible pour la diaspora ?',
    a: 'Oui. Tu peux télécharger Linky depuis n\'importe quel pays et payer en € avec une carte bancaire. Les livraisons se font dans les zones de couverture de nos partenaires en Guinée.',
  },
  {
    q: 'Comment devenir vendeur vérifié ?',
    a: 'Inscris-toi, choisis le rôle Vendeur ou Agent immobilier, puis fais la vérification KYC en 3 minutes : photo de ta pièce d\'identité, selfie, et c\'est validé sous 48 h.',
  },
  {
    q: 'Linky est gratuit ?',
    a: 'L\'app et la création d\'annonces sont gratuites. Tu paies uniquement quand tu achètes ou quand tu réussis une vente. Les boosts d\'annonces sont en option, à partir de 8 000 GNF.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-10">
        <div className="text-center">
          <div className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Questions fréquentes
          </div>
          <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            On répond aux essentiels.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-border rounded-3xl border border-line bg-card">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-sunken/40 sm:px-6"
                >
                  <span className="font-display text-base font-bold tracking-tight md:text-lg">
                    {f.q}
                  </span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
                    {isOpen ? (
                      <Minus size={15} strokeWidth={2.25} />
                    ) : (
                      <Plus size={15} strokeWidth={2.25} />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-5 pb-6 text-[15px] leading-relaxed text-muted sm:px-6">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
