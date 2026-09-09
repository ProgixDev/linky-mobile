/**
 * Un lien de notification mene-t-il quelque part ?
 *
 * DEUX CONDITIONS, et la seconde est nee du retrait des visites (2026-09-09).
 *
 * 1. Le lien doit etre interne. Un lien externe pousse dans le routeur ouvre
 *    au mieux un ecran vide, au pire un site tiers depuis une notification.
 *
 * 2. Le lien ne doit pas viser un ecran SUPPRIME. Les notifications vivent
 *    dans la base bien plus longtemps que les ecrans qui les ont emises :
 *    request-visit ecrivait « /pro/visites/<id> », visit-respond et
 *    visit-complete « /buyer/requests ». Ces trois routes n'existent plus.
 *    Sans ce filtre, une notification d'aout ouvrirait l'ecran « Unmatched
 *    route » d'expo-router — un cul-de-sac technique, sans retour possible sur
 *    un cold start.
 *
 * On NEUTRALISE le lien plutot que de masquer la notification : le texte reste
 * lisible dans l'historique, la ligne cesse simplement d'etre cliquable. Effacer
 * l'historique de quelqu'un pour cacher une fonctionnalite retiree serait pire
 * que le probleme.
 */
const REMOVED_ROUTES = ['/pro/visites', '/buyer/requests'];

export function isOpenableDeeplink(deeplink: unknown): deeplink is string {
  if (typeof deeplink !== 'string' || !deeplink.startsWith('/')) return false;
  return !REMOVED_ROUTES.some((r) => deeplink === r || deeplink.startsWith(`${r}/`));
}
