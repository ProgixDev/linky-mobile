import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Conditions générales',
  description: 'Conditions générales d\'utilisation de Linky.',
};

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Légal"
      title="Conditions générales d'utilisation."
      subtitle="L'essentiel pour comprendre tes droits et obligations en utilisant Linky."
    >
      <LegalSections
        updated="15 mai 2026"
        sections={[
          {
            heading: 'Acceptation',
            body: (
              <p>
                En utilisant Linky, tu acceptes les présentes conditions
                générales. Elles régissent ta relation avec{' '}
                l&apos;éditeur de Linky, dont les informations légales sont
                publiées dans les <a href="/legal/notices">mentions légales</a>.
              </p>
            ),
          },
          {
            heading: 'Compte utilisateur',
            body: (
              <p>
                Tu dois avoir au moins 18 ans et fournir des informations
                exactes. Tu es responsable de la sécurité de ton compte et de
                toute activité s&apos;y rapportant.
              </p>
            ),
          },
          {
            heading: 'Annonces et transactions',
            body: (
              <p>
                Tu t&apos;engages à publier uniquement des annonces conformes à
                la loi guinéenne. Linky agit comme intermédiaire technique et
                utilise un escrow pour sécuriser les paiements.
              </p>
            ),
          },
          {
            heading: 'Paiements et frais',
            body: (
              <p>
                Les paiements sont effectués via Mobile Money ou carte
                bancaire. Une commission peut s&apos;appliquer sur les
                transactions, clairement indiquée avant validation.
              </p>
            ),
          },
          {
            heading: 'Litiges',
            body: (
              <p>
                En cas de désaccord, tu peux ouvrir un litige directement dans
                l&apos;app. Nous examinons chaque litige et proposons une
                résolution.
              </p>
            ),
          },
          {
            heading: 'Contenus interdits',
            body: (
              <>
                <p>Sont interdits :</p>
                <ul>
                  <li>Produits illicites, armes, drogues</li>
                  <li>Contenus violents, haineux, discriminatoires</li>
                  <li>Contrefaçons et copies non autorisées</li>
                  <li>Services illégaux</li>
                </ul>
                <p>
                  Toute annonce non conforme sera retirée et le compte
                  sanctionné.
                </p>
              </>
            ),
          },
          {
            heading: 'Limitation de responsabilité',
            body: (
              <p>
                Linky n&apos;est pas partie aux transactions entre
                utilisateurs. Notre responsabilité se limite à la mise à
                disposition de la plateforme et à la médiation des litiges.
              </p>
            ),
          },
          {
            heading: 'Modification des conditions',
            body: (
              <p>
                Nous pouvons modifier ces conditions à tout moment. Les
                changements substantiels te seront notifiés par email ou
                notification in-app.
              </p>
            ),
          },
          {
            heading: 'Droit applicable',
            body: (
              <p>
                Les présentes conditions sont régies par le droit guinéen. Tout
                différend sera soumis aux tribunaux compétents de Conakry.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
