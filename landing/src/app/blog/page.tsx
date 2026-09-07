// Aucun article n'a jamais ete ecrit, et la page n'en annonce plus.
//
// Jusqu'au 2026-09-07 elle presentait quatre articles — « Linky arrive en
// Guinee », « Ta premiere vente sur Linky en 5 etapes », « Comment marche
// l'escrow Mobile Money ? », « Pourquoi on a fait Decouvrir en vertical » —
// avec categorie, date et temps de lecture. Aucun n'existait : ils pointaient
// tous vers /blog/<slug>, et il n'y a jamais eu de route [slug] dans
// src/app/blog. Chaque lien tombait donc en 404.
//
// La page est conservee (le pied de page y renvoie) mais ne promet plus rien
// qu'elle ne puisse tenir.
import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Actualités produit et conseils Linky — bientôt.',
};

export default function BlogPage() {
  return (
    <PageShell
      eyebrow="Blog"
      title="Bientôt, ici."
      subtitle="Nous n'avons pas encore publié d'article. Ça viendra avec l'ouverture du service."
    >
      <p className="text-sm leading-relaxed opacity-80">
        On y racontera ce qu&apos;on construit et pourquoi : comment le paiement
        est gardé en séquestre jusqu&apos;à ce que tu confirmes la réception,
        comment vendre sur Linky, et ce qui change à chaque version.
      </p>
      <p className="mt-4 text-sm leading-relaxed opacity-80">
        Pour être prévenu, écris-nous à{' '}
        <a href="mailto:contact@linkygroup.com" className="underline">
          contact@linkygroup.com
        </a>
        .
      </p>
    </PageShell>
  );
}
