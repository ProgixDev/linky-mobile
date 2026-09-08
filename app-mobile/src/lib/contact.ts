// Les coordonnées publiques de Linky — UN seul endroit.
//
// POURQUOI UNE CONSTANTE ET PAS DU TEXTE DANS LES ÉCRANS. Le numéro sert à
// quatre choses à la fois : ce qui s'affiche, le lien `tel:`, le lien WhatsApp,
// et cela sur deux écrans. Écrit à la main, il finirait par différer quelque
// part — et un chiffre faux dans un lien d'appel ne se voit pas à la relecture,
// il se découvre le jour où un client compose dans le vide.
//
// Le numéro n'est PAS dans les fichiers de traduction : un numéro de téléphone
// ne se traduit pas, et l'y mettre obligerait à le corriger dans trois langues.
// Seuls les libellés autour sont traduits.
//
// Fourni par le client le 2026-09-08.
//
// ⚠️ NOTE POUR PLUS TARD. Un numéro d'appel avait été RETIRÉ de l'écran d'aide
// parce qu'il s'agissait d'un bouche-trou (+224 622 00 00 00) qui ne menait
// nulle part — un bouton qui ne répond jamais use la confiance plus qu'il ne la
// crée. Celui-ci est réel et fourni par le client, ce qui est exactement la
// condition qui manquait. S'il devait cesser de répondre un jour, la bonne
// réaction est de retirer les deux lignes, pas de les laisser sonner dans le
// vide.

/** Format E.164, pour les liens. */
export const CONTACT_PHONE_E164 = '+224610574736';

/** Format lisible, pour l'affichage. */
export const CONTACT_PHONE_DISPLAY = '+224 610 57 47 36';

/** Ouvre le composeur du téléphone. */
export const CONTACT_PHONE_TEL_URL = `tel:${CONTACT_PHONE_E164}`;

/** wa.me veut le numéro SANS le « + » ni espaces. */
export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_PHONE_E164.replace('+', '')}`;
