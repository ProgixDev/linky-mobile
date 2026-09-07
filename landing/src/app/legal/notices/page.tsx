// L'identité de l'éditeur est VOLONTAIREMENT absente tant que le client ne l'a
// pas fournie.
//
// Cette page a porté jusqu'au 2026-09-07 une société entière qui n'existe pas :
// une raison sociale, un capital, une adresse à Conakry, un numéro RCCM, un NIF
// et une présidente nommée — tous inventés, jamais communiqués par le client.
// Un texte de remplissage dans une page de présentation n'engage personne ; un
// RCCM et un NIF inventés dans des mentions légales sont une fausse déclaration
// d'identité d'entreprise, et celle-ci portait en plus le nom d'une personne.
//
// Une page incomplète est un manquement administratif que la publication des
// vraies informations corrige. Une page fausse, non. D'où ce choix : on annonce
// ce qui manque, on ne le devine pas.
import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Informations légales sur l\'éditeur du site Linky.',
};

export default function LegalNoticesPage() {
  return (
    <PageShell
      eyebrow="Légal · Mentions"
      title="Mentions légales."
      subtitle="Informations sur l'éditeur, l'hébergeur et les responsables de la publication."
    >
      <LegalSections
        updated="15 mai 2026"
        sections={[
          {
            heading: 'Éditeur du site',
            body: (
              <>
                <p>
                  Les informations légales de l&apos;éditeur (raison sociale,
                  forme juridique, siège social, numéro RCCM et NIF) seront
                  publiées ici avant l&apos;ouverture du service au public.
                </p>
                <p>
                  Pour toute question relative à l&apos;éditeur de ce site,
                  écris à <a href="mailto:contact@linkygroup.com">contact@linkygroup.com</a>.
                </p>
              </>
            ),
          },
          {
            heading: 'Direction de la publication',
            body: (
              <p>
                Le responsable de la publication sera désigné nommément ici en
                même temps que les informations relatives à l&apos;éditeur.
              </p>
            ),
          },
          {
            heading: 'Hébergement',
            body: (
              <p>
                Vercel Inc.
                <br />
                440 N Barranca Ave #4133, Covina, CA 91723, USA
                <br />
                privacy@vercel.com
              </p>
            ),
          },
          {
            heading: 'Propriété intellectuelle',
            body: (
              <p>
                L&apos;ensemble du contenu de ce site (textes, graphiques,
                logos, icônes, images, sons, logiciels) est la propriété
                exclusive de l&apos;éditeur du site, à l&apos;exception des
                marques, logos ou contenus appartenant à d&apos;autres sociétés
                partenaires ou auteurs.
              </p>
            ),
          },
          {
            heading: 'Crédits',
            body: (
              <p>
                Photographies : Unsplash &amp; production interne. Icônes :{' '}
                <a href="https://lucide.dev" target="_blank" rel="noreferrer">
                  Lucide
                </a>
                . Typographies : Inter &amp; Space Grotesk.
              </p>
            ),
          },
          {
            heading: 'Données personnelles',
            body: (
              <p>
                Le traitement des données personnelles est décrit dans notre{' '}
                <a href="/legal/privacy">Politique de confidentialité</a>.
              </p>
            ),
          },
          {
            heading: 'Litiges',
            body: (
              <p>
                Tout litige relatif à l&apos;utilisation de ce site est soumis
                au droit guinéen. À défaut de résolution amiable, le litige
                sera porté devant les tribunaux compétents de Conakry.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
