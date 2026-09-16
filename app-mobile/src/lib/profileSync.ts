import { useEffect, useRef } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useAuth } from '../stores/auth';
import { fetchMe } from '../data/queries/auth';

/**
 * A chaque ouverture de l'application : recharger le profil, puis demander la
 * region de paiement aux comptes qui n'en ont pas.
 *
 * DEMANDE DU CLIENT, 2026-09-17 : l'inscription enregistre desormais la region
 * (« Vous etes ou ? »), et « ca marche » pour un compte neuf. Mais les comptes
 * EXISTANTS n'en ont aucune, et leur region reste deduite de l'indicatif — un
 * compte guineen tenu depuis l'etranger voit donc LengoPay au lieu de Stripe.
 * « Il faut que je refasse l'inscription des comptes deja existants » : non. On
 * leur pose la meme question, une seule fois.
 *
 * LE SERVEUR D'ABORD, LA QUESTION ENSUITE. Le profil en cache peut etre
 * perime : un compte deja corrige par l'equipe (payment_profile ecrit en base)
 * garde un cache sans region tant qu'il ne s'est pas reconnecte. Poser la
 * question sur la foi de ce cache la reposerait a quelqu'un qui a deja une
 * region — et, s'il repondait autrement, le verrou serveur refuserait. On ne
 * decide donc qu'apres get-me.
 *
 * HORS LIGNE, ON NE DEMANDE RIEN. Si get-me echoue, aucune question n'est
 * posee : la regle de l'indicatif reste le repli, et la question reviendra a
 * une prochaine ouverture. Mieux vaut ne rien demander que demander sur une
 * base qu'on ne connait pas.
 *
 * UNE FOIS PAR SESSION DE COMPTE, pas a chaque rendu : la reference retient
 * pour quel compte la synchronisation a deja eu lieu.
 */
export function useProfileSync(): void {
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const authUserId = useAuth((s) => s.authUserId);
  const isOnboarded = useAuth((s) => s.isOnboarded);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    // Pas pendant l'inscription : c'est l'etape de profil qui y enregistre la
    // region. Et pas avant que le navigateur racine existe.
    if (!navReady || !isOnboarded || !authUserId) return;
    if (syncedFor.current === authUserId) return;
    syncedFor.current = authUserId;

    let cancelled = false;
    (async () => {
      try {
        const { user } = await fetchMe();
        if (cancelled) return;
        const state = useAuth.getState();
        // Le compte a pu changer pendant l'appel (deconnexion, autre compte).
        if (state.authUserId !== user.id) return;
        state.signIn({ ...(state.user ?? {}), ...user });
        if (user.payment_profile == null) {
          router.push('/region' as never);
        }
      } catch {
        // Voir « Hors ligne, on ne demande rien » ci-dessus.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navReady, isOnboarded, authUserId]);
}
