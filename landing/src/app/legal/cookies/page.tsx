import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Politique cookies',
  description: 'Comment Linky utilise les cookies et identifiants techniques.',
};

export default function CookiesPage() {
  return (
    <PageShell
      eyebrow="Légal · Cookies"
      title="Politique cookies."
      subtitle="Ce qu'on stocke localement, pourquoi, et comment refuser."
    >
      <LegalSections
        updated="15 mai 2026"
        sections={[
          {
            heading: 'Qu\'est-ce qu\'un cookie ?',
            body: (
              <p>
                Un cookie est un petit fichier déposé sur ton appareil par le
                site que tu visites. Il permet au site de te reconnaître à ta
                prochaine visite et de mémoriser tes préférences.
              </p>
            ),
          },
          {
            heading: 'Cookies essentiels',
            body: (
              <>
                <p>
                  Ces cookies sont indispensables au fonctionnement du site et
                  ne peuvent pas être désactivés.
                </p>
                <ul>
                  <li>
                    <strong>session_id</strong> — identifie ta session active
                  </li>
                  <li>
                    <strong>csrf_token</strong> — protection contre les
                    attaques CSRF
                  </li>
                  <li>
                    <strong>cookie_consent</strong> — mémorise ton choix sur
                    cette page
                  </li>
                </ul>
              </>
            ),
          },
          {
            heading: 'Cookies de mesure d\'audience',
            body: (
              <>
                <p>
                  Avec ton accord, ces cookies nous aident à comprendre comment
                  Linky est utilisé. Données anonymisées et agrégées.
                </p>
                <ul>
                  <li>
                    <strong>_va</strong> — Vercel Analytics (durée : 1 an)
                  </li>
                </ul>
              </>
            ),
          },
          {
            heading: 'Pas de cookies publicitaires',
            body: (
              <p>
                Linky ne dépose <strong>aucun cookie publicitaire</strong> ni
                de traqueur tiers (Facebook Pixel, Google Ads, etc.). On ne
                vend pas non plus tes données à des annonceurs.
              </p>
            ),
          },
          {
            heading: 'Gérer tes préférences',
            body: (
              <p>
                Tu peux à tout moment modifier ton choix via la barre de
                consentement en bas de page ou dans les paramètres de ton
                navigateur (Chrome, Safari, Firefox).
              </p>
            ),
          },
          {
            heading: 'Contact',
            body: (
              <p>
                Pour toute question sur l&apos;usage des cookies :{' '}
                <a href="mailto:privacy@linkygroup.com">privacy@linkygroup.com</a>.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
