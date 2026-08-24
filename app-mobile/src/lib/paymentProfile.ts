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
import { useMemo } from 'react';
import { useMyPhones } from '../data/queries/phones';

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
  /** Vrai tant qu'on ne sait pas : ne PAS decider d'un rail de paiement dessus. */
  loading: boolean;
  /** Le numero qui a servi a trancher — utile pour l'expliquer a l'ecran. */
  e164: string | null;
}

export function usePaymentProfile(): PaymentProfileState {
  const { data: phones, isLoading } = useMyPhones();
  return useMemo(() => {
    const list = phones ?? [];
    // Le numero principal fait foi ; a defaut, le premier verifie.
    const primary = list.find((p) => p.is_primary) ?? list[0] ?? null;
    const e164 = primary?.e164 ?? null;
    return { profile: profileFromPhone(e164), loading: isLoading, e164 };
  }, [phones, isLoading]);
}
