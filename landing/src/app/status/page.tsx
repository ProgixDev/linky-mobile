// Cette page ne mesure RIEN, et elle le dit maintenant.
//
// Jusqu'au 2026-09-07 elle affichait dix services tous au vert, trois incidents
// passés avec dates et durées precises (« latence accrue pendant 18 min le
// 12 mai »), « Mis à jour automatiquement toutes les 60 secondes » et
// « Dernière vérification il y a 14 secondes ». Tout etait ecrit en dur dans le
// fichier : aucune sonde, aucune mesure, aucun incident reel — le service n'a
// jamais ete ouvert au public et il n'existe a ce jour aucune supervision, ni
// rapport de plantage, ni suivi d'erreurs.
//
// Une page de statut est le seul endroit d'un site ou un visiteur vient
// chercher un fait verifiable. Y ecrire du vert en dur, c'est exactement
// l'inverse de sa raison d'etre : le jour d'une vraie panne, elle aurait
// affiche « tous les services fonctionnent normalement ».
//
// On la garde plutot que de la supprimer pour que les liens existants (pied de
// page, e-mails deja envoyes) ne tombent pas en 404. Elle sera remplacee par de
// vraies mesures quand une supervision existera.
import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Statut des services',
  description:
    'État des services Linky. Le service n\'est pas encore ouvert au public.',
};

export default function StatusPage() {
  return (
    <PageShell
      eyebrow="Statut"
      title="Pas encore ouvert au public."
      subtitle="Linky est en préparation. Cette page publiera l'état réel des services le jour de l'ouverture."
    >
      <div className="rounded-3xl bg-[#E4ECF6] p-8 ring-1 ring-[#3A7CA8]/25">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3A7CA8] text-white">
            ●
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Service en préparation
            </h2>
            <p className="mt-1 text-sm opacity-75">
              Aucune mesure en temps réel n&apos;est disponible aujourd&apos;hui.
            </p>
          </div>
        </div>
      </div>

      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Ce que cette page affichera
      </h2>
      <p className="mt-4 text-sm leading-relaxed opacity-80">
        À l&apos;ouverture, tu trouveras ici l&apos;état de chaque composant —
        marketplace, immobilier, portefeuille et paiements, notifications,
        application mobile, back-office — ainsi que l&apos;historique des
        incidents, avec leur durée et leur résolution. Tant que le service
        n&apos;a pas ouvert, il n&apos;y a ni mesure ni incident à publier, et
        cette page ne prétendra pas le contraire.
      </p>

      <h2 className="font-display mt-12 text-2xl font-bold tracking-tight">
        Signaler un problème
      </h2>
      <p className="mt-4 text-sm leading-relaxed opacity-80">
        Écris à{' '}
        <a href="mailto:support@linkygroup.com" className="underline">
          support@linkygroup.com
        </a>
        . Décris ce que tu faisais, ce que tu attendais et ce qui s&apos;est
        passé — c&apos;est ce qui nous permet de reproduire le problème.
      </p>
    </PageShell>
  );
}
