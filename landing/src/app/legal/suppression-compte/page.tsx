import type { Metadata } from 'next';
import { PageShell, LegalSections } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Suppression de compte',
  description:
    'Comment supprimer ton compte Linky et tes données, ce qui est effacé, ce qui est conservé et pourquoi.',
};

// Public account-deletion page — required by Google Play (Data safety) and the
// App Store: a URL, reachable without installing the app, explaining how to
// delete the account + data. The in-app path lives at Profil → Confidentialité.
export default function AccountDeletionPage() {
  return (
    <PageShell
      eyebrow="Compte · Suppression"
      title="Supprimer ton compte."
      subtitle="Comment demander la suppression de ton compte Linky et de tes données."
    >
      <LegalSections
        updated="11 juillet 2026"
        sections={[
          {
            heading: 'Depuis l’application (recommandé)',
            body: (
              <>
                <p>La suppression se fait en quelques secondes depuis l&apos;app&nbsp;:</p>
                <ul>
                  <li>Ouvre <strong>Linky</strong> et connecte-toi.</li>
                  <li>Va dans <strong>Profil → Confidentialité</strong>.</li>
                  <li>Appuie sur <strong>« Supprimer mon compte »</strong> et confirme.</li>
                </ul>
                <p>
                  Ton compte est désactivé immédiatement et tu es déconnecté de
                  tous tes appareils.
                </p>
              </>
            ),
          },
          {
            heading: 'Sans accès à l’application',
            body: (
              <p>
                Si tu ne peux plus ouvrir l&apos;app, écris-nous à{' '}
                <a href="mailto:support@linkygroup.com">support@linkygroup.com</a> depuis
                l&apos;adresse e-mail (ou avec le numéro) de ton compte, avec
                pour objet <strong>« Suppression de compte »</strong>. Nous
                traitons la demande sous 30 jours.
              </p>
            ),
          },
          {
            heading: 'Ce qui est supprimé',
            body: (
              <ul>
                <li>Ton profil (nom, ville, photo) — anonymisé.</li>
                <li>Ton numéro de téléphone et ton e-mail — libérés.</li>
                <li>Tes sessions et notifications.</li>
                <li>Tes annonces en cours — retirées de la vente.</li>
              </ul>
            ),
          },
          {
            heading: 'Ce qui est conservé — et pourquoi',
            body: (
              <p>
                Pour des raisons <strong>légales et comptables</strong>, les
                enregistrements liés aux <strong>transactions déjà effectuées</strong>{' '}
                (commandes payées, mouvements du registre financier) sont
                conservés de façon <strong>anonymisée</strong> — ils ne sont plus
                rattachés à ton identité. Nous ne les utilisons pas à d&apos;autres
                fins.
              </p>
            ),
          },
          {
            heading: 'Avant de supprimer',
            body: (
              <>
                <p>La suppression est refusée tant qu&apos;une valeur est en jeu&nbsp;:</p>
                <ul>
                  <li>ton portefeuille doit être <strong>vide</strong> (retire ton solde) ;</li>
                  <li>aucune <strong>commande ou réservation</strong> ne doit être en cours ;</li>
                  <li>aucun <strong>retrait</strong> ne doit être en attente.</li>
                </ul>
                <p>Termine ou attends la clôture de ces opérations, puis relance la suppression.</p>
              </>
            ),
          },
          {
            heading: 'Contact',
            body: (
              <p>
                Une question sur tes données&nbsp;?{' '}
                <a href="mailto:privacy@linkygroup.com">privacy@linkygroup.com</a>.
              </p>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
