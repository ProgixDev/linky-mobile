// Numeros mobiles guineens : 9 chiffres, commencent par 6. Un seul endroit
// pour cette regle — elle etait dupliquee dans app/wallet/retirer.tsx, et le
// 2026-08-25 un second appelant (le paiement mobile money pour les comptes
// sans numero) en avait besoin a l'identique. Deux copies auraient fini par
// diverger sur un point d'argent.

/** Retire un indicatif +224/224 colle, et tout ce qui n'est pas un chiffre. */
export function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}

/** « 622551288 » -> « 622 55 12 88 », pour l'affichage seulement. */
export function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function isValidGnPhone(d: string): boolean {
  return d.length === 9 && d.startsWith('6');
}
