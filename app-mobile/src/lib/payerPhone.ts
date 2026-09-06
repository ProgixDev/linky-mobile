// Le numero QUI PAIE en mobile money (Orange Money / MTN).
//
// POURQUOI CE N'EST PAS LE NUMERO DU COMPTE. Client 2026-09-05 : « Beaucoup de
// Guineens de la diaspora comme moi ont des comptes Orange ou MTN money guineen
// qu'ils pilotent a distance. » Le numero de connexion et le numero qui paie
// sont deux choses differentes : un compte ouvert par email ou avec un numero
// etranger peut tres bien regler avec un compte OM/MTN guineen.
//
// CE QUE FAISAIT LE CODE AVANT (et qui etait un vrai blocage) : le champ ne
// s'affichait QUE pour un compte sans aucun numero. Des qu'un numero existait —
// meme +33 — le paiement partait de force sur lui. Depuis le passage a
// Lengopay v2, qui exige un numero LOCAL guineen, ce cas ne renvoyait meme plus
// une erreur comprehensible : juste « Echec de l'initialisation du paiement ».
//
// LA REGLE MAINTENANT : le champ est toujours propose pour le mobile money,
// pre-rempli avec le numero du compte quand il est guineen (le cas courant, un
// geste en moins), librement modifiable sinon.
import { useState } from 'react';
import { usePaymentProfile } from './paymentProfile';
import { normalizeGnPhone, isValidGnPhone } from './gnPhone';

export interface PayerPhoneState {
  /** 9 chiffres, sans indicatif — pour l'affichage et la validation. */
  digits: string;
  valid: boolean;
  /** Vrai tant que le numero du compte n'est pas connu (evite un champ qui se
   *  pre-remplit sous les doigts de l'utilisateur). */
  loading: boolean;
  /** +224XXXXXXXXX a envoyer au serveur, ou undefined si pas encore valide. */
  e164?: string;
  onChange: (raw: string) => void;
}

export function usePayerPhone(): PayerPhoneState {
  const { e164: onFilePhone, loading } = usePaymentProfile();
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);

  const onFileDigits = onFilePhone ? normalizeGnPhone(onFilePhone) : '';
  // Tant que l'utilisateur n'a pas touche au champ, on montre le numero du
  // compte s'il est guineen. Des qu'il y touche, c'est SA saisie qui fait foi —
  // sinon on ecraserait ce qu'il tape des que la requete du profil repond.
  const digits = touched ? input : (isValidGnPhone(onFileDigits) ? onFileDigits : input);
  const valid = isValidGnPhone(digits);

  return {
    digits,
    valid,
    loading,
    e164: valid ? `+224${digits}` : undefined,
    onChange: (raw: string) => {
      setTouched(true);
      setInput(normalizeGnPhone(raw));
    },
  };
}
