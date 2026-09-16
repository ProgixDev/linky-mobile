// Profil de paiement : l'acheteur est-il en Guinee, ou a l'etranger ?
//
// Client 2026-08-24 (reunion Lengopay) : « Bouton dynamique Carte bancaire via
// Stripe pour les profils a l'etranger, et Carte bancaire/Wallet via Lengopay
// pour les profils en Guinee. »
//
// LA REGLE : l'indicatif du numero principal. +224 = Guinee, tout le reste =
// etranger.
//
// POURQUOI CELLE-CI plutot qu'une geolocalisation, une adresse IP ou un champ
// pays a remplir :
//   * on l'a DEJA — tout compte porte un numero verifie, au format
//     international. Aucun ecran a ajouter, rien a demander a l'utilisateur ;
//   * elle est STABLE — un indicatif ne change pas quand on voyage. Un Guineen
//     en deplacement continue de voir le bon bouton, ce qu'une geolocalisation
//     ferait echouer ;
//   * elle colle au cas reel — le « profil a l'etranger », c'est la diaspora
//     qui paie pour la famille : numero etranger et carte etrangere vont
//     ensemble.
//
// AUCUN NUMERO = ETRANGER, et ce n'est pas un repli arbitraire. L'application
// pose deja la question a la connexion, dans ses propres mots :
//     onboarding.authChoice.phoneTitle = « I'm in Guinea »  (Phone & Mobile Money)
//     onboarding.authChoice.emailTitle = « I'm abroad »     (Email & Card)
// Un compte sans numero n'a donc qu'une seule origine possible : le parcours
// email, celui que l'ecran nomme « I'm abroad ». Le classer en Guinee
// contredirait ce que l'utilisateur a lui-meme declare en s'inscrivant.
//
// Mesure faite le 2026-08-24 : 15 comptes sur 20 n'ont AUCUN numero. Un repli
// sur la Guinee se serait donc trompe sur trois comptes sur quatre.
//
// CAS NON COUVERT PAR LA REGLE, ET C'EST VOULU : la diaspora qui a GARDE sa
// carte SIM guinieenne en vivant a l'etranger. Plutot que de deviner encore
// plus fort, users.payment_abroad_override laissait la personne le declarer
// elle-meme dans Reglages > Confidentialite.
//
// CE N'ETAIT PAS UNE SOLUTION, ET LA BASE LE DIT : au 2026-09-16, sur 20
// comptes, AUCUN n'avait jamais active cet interrupteur. Le client : « Le bouton
// est trop cache pour activer. On peut deja verrouiller au moment de
// l'inscription. »
//
// DEPUIS, LA REGION DECLAREE PRIME. L'inscription enregistre la reponse a
// « Vous etes ou ? » dans users.payment_profile, une seule fois. Quand elle
// existe, plus aucune deduction ne s'applique : ajouter plus tard un numero +224
// ne fait plus basculer un compte « a l'etranger » en Guinee. La regle de
// l'indicatif ne sert plus que de REPLI, pour les comptes anterieurs a ce
// changement (region NULL).
import { useMemo } from 'react';
import { useMyPhones } from '../data/queries/phones';
import { useAuth } from '../stores/auth';

export type PaymentProfile = 'guinea' | 'abroad';

/** Indicatif guineen. Isole ici : c'est la seule constante de la regle. */
export const GUINEA_DIAL_CODE = '+224';

/** Regle pure, testable sans hook ni reseau. */
export function profileFromPhone(e164: string | null | undefined): PaymentProfile {
  // Pas de numero = inscription par email = parcours « I'm abroad ».
  if (!e164) return 'abroad';
  // On normalise : certains enregistrements anciens portent des espaces.
  const n = e164.replace(/\s/g, '');
  return n.startsWith(GUINEA_DIAL_CODE) ? 'guinea' : 'abroad';
}

export interface PaymentProfileState {
  profile: PaymentProfile;
  /** Vrai tant qu'on ne SAIT PAS — chargement en cours, ou requete en echec.
   *  Ne PAS decider d'un rail de paiement dessus tant qu'il est vrai. */
  loading: boolean;
  /** Le numero qui a servi a trancher — utile pour l'expliquer a l'ecran. */
  e164: string | null;
}

export function usePaymentProfile(): PaymentProfileState {
  const { data: phones, isLoading, isError } = useMyPhones();
  // Diaspora escape hatch (2026-09-05) : un numero +224 garde en vivant a
  // l'etranger classait a tort en 'guinea' sans aucun moyen de corriger.
  // Reglable dans Reglages > Confidentialite ; false = comportement inchange.
  const abroadOverride = useAuth((s) => s.user?.payment_abroad_override) ?? false;
  const declared = useAuth((s) => s.user?.payment_profile) ?? null;
  return useMemo(() => {
    const list = phones ?? [];
    // Le numero principal fait foi ; a defaut, le premier verifie.
    const primary = list.find((p) => p.is_primary) ?? list[0] ?? null;
    const e164 = primary?.e164 ?? null;
    // La region DECLAREE a l'inscription prime sur toute deduction.
    if (declared === 'guinea' || declared === 'abroad') {
      // Elle ne depend d'aucune requete : on la connait des l'ouverture de la
      // session. Inutile de faire attendre l'ecran de paiement le chargement
      // des numeros, ni de masquer les cartes si cette requete echoue.
      return { profile: declared, loading: false, e164 };
    }
    return {
      profile: abroadOverride ? 'abroad' : profileFromPhone(e164),
      // UNE REQUETE EN ECHEC N'EST PAS UNE ABSENCE DE NUMERO.
      //
      // TanStack repasse isLoading a false une fois les reessais epuises, mais
      // `data` reste undefined. Sans `isError`, on lisait donc « aucun numero »
      // — et la regle documentee juste au-dessus traduit ca par 'abroad'. Un
      // acheteur A CONAKRI, sur une 3G qui coupe, se voyait proposer la carte
      // Stripe : le seul rail qui refuse justement les cartes guineennes. Il
      // payait un echec, sans rien pour l'expliquer.
      //
      // `loading` est le drapeau que TOUTES les surfaces de paiement utilisent
      // deja pour n'afficher AUCUNE des deux cartes tant que le profil est
      // inconnu. On y range donc l'echec : ne pas savoir et ne pas savoir
      // encore appellent exactement la meme prudence.
      loading: isLoading || isError,
      e164,
    };
  }, [phones, isLoading, isError, abroadOverride, declared]);
}
