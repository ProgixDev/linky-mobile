import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Comment Linky collecte, utilise et protège tes données.',
};

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Légal · Confidentialité"
      title="Politique de confidentialité."
      subtitle="Ce que nous faisons (et ne faisons pas) avec tes données personnelles."
    >
      <LegalSections
        updated="15 mai 2026"
        sections={[
          {
            heading: 'Données que nous collectons',
            body: (
              <>
                <p>Nous collectons les données suivantes :</p>
                <ul>
                  <li>
                    <strong>Compte :</strong> nom, téléphone, email, photo
                  </li>
                  <li>
                    <strong>Localisation :</strong> uniquement si tu
                    l&apos;autorises explicitement
                  </li>
                  <li>
                    <strong>Contenu publié :</strong> annonces, messages, avis
                  </li>
                  <li>
                    <strong>Données techniques :</strong> modèle d&apos;appareil,
                    OS
                  </li>
                  <li>
                    <strong>Paiements :</strong> chiffrés, jamais stockés en
                    clair
                  </li>
                </ul>
              </>
            ),
          },
          {
            heading: 'Pourquoi nous les utilisons',
            body: (
              <p>
                Pour faire fonctionner l&apos;app, sécuriser les transactions,
                personnaliser ton expérience (avec ton accord), prévenir la
                fraude, et te contacter sur des sujets liés à ton compte.
              </p>
            ),
          },
          {
            heading: 'Partage de tes données',
            body: (
              <p>
                On ne vend jamais tes données. On les partage uniquement avec
                nos prestataires techniques (hébergement, paiement, SMS), nos
                partenaires de livraison quand tu en bénéficies, et les
                autorités si la loi l&apos;exige.
              </p>
            ),
          },
          {
            heading: 'Tes droits',
            body: (
              <p>
                Tu peux à tout moment accéder à tes données, les modifier ou
                demander leur suppression directement dans{' '}
                <strong>Profil → Confidentialité</strong>. Pour obtenir une copie
                de tes données (export), écris-nous à{' '}
                <strong>privacy@linkygroup.com</strong> — nous répondons sous 30 jours.
              </p>
            ),
          },
          {
            heading: 'Conservation',
            body: (
              <p>
                On garde tes données tant que ton compte est actif. Après
                suppression, certaines informations peuvent être conservées
                jusqu&apos;à 3 ans pour répondre à nos obligations légales et
                comptables.
              </p>
            ),
          },
          {
            heading: 'Sécurité',
            body: (
              <p>
                Tes données sont chiffrées en transit (TLS) et au repos. Les
                mots de passe ne sont jamais stockés en clair. Nos serveurs
                sont hébergés dans des datacenters certifiés ISO 27001.
              </p>
            ),
          },
          {
            heading: 'Cookies et identifiants',
            body: (
              <p>
                L&apos;app utilise des identifiants techniques (session,
                préférences) et, si tu l&apos;autorises, des identifiants
                d&apos;analyse pour comprendre comment Linky est utilisé.
              </p>
            ),
          },
          {
            heading: 'Mineurs',
            body: (
              <p>
                Linky est réservée aux personnes de 18 ans et plus. Si tu
                découvres qu&apos;un compte appartient à un mineur, signale-le
                à <strong>privacy@linkygroup.com</strong>.
              </p>
            ),
          },
          {
            heading: 'Contact',
            body: (
              <p>
                Toute question sur tes données : <strong>privacy@linkygroup.com</strong>.
                Notre Délégué à la Protection des Données répond sous 30 jours.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
