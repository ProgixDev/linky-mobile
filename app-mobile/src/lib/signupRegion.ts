import { storage, STORAGE_KEYS } from './storage';
import type { PaymentProfile } from './paymentProfile';

/**
 * La region de paiement declaree a l'inscription, entre l'ecran « Vous etes
 * ou ? » et l'etape de profil qui l'enregistre.
 *
 * Demande du client, 2026-09-16 : « On peut deja verrouiller au moment de
 * l'inscription : si profil en Guinee paiement par carte (LengoPay), si profil a
 * l'etranger paiement par carte (Stripe). »
 *
 * UNE VALEUR ABSENTE N'EST JAMAIS REMPLACEE PAR UNE SUPPOSITION. La region est
 * ecrite une seule fois cote serveur, puis verrouillee. Si on ne sait pas ce que
 * la personne a choisi — stockage vide, parcours interrompu, ancienne version —
 * on n'envoie rien : le compte garde une region NULL, et l'application retombe
 * sur la regle de l'indicatif telephonique. Mieux vaut ne rien verrouiller que
 * verrouiller une erreur.
 */
export function saveSignupRegion(region: PaymentProfile): void {
  storage.set(STORAGE_KEYS.signupRegion, region);
}

export function readSignupRegion(): PaymentProfile | null {
  const v = storage.getString(STORAGE_KEYS.signupRegion);
  return v === 'guinea' || v === 'abroad' ? v : null;
}

export function clearSignupRegion(): void {
  storage.remove(STORAGE_KEYS.signupRegion);
}
