// Liste de blocage — le filtre partagé par toutes les surfaces de découverte.
//
// SYMÉTRIQUE, ET C'EST LE POINT IMPORTANT. Si A bloque B, on masque le contenu
// de B pour A *et* celui de A pour B. Un blocage à sens unique ne protège pas
// dans une place de marché : il suffirait à B de continuer à voir les annonces
// de A pour lui commander quelque chose et reprendre le contact par la
// commande. La requête lit donc les deux colonnes et rend « les gens avec qui
// l'appelant n'a plus de lien visible », sans distinguer qui a bloqué qui.
//
// ┌─ CE QUE CE FILTRE NE DOIT JAMAIS TOUCHER ────────────────────────────────┐
// Les surfaces de DÉCOUVERTE seulement : listes d'annonces, fils de
// commentaires, avis. Jamais une commande, une réservation, une livraison ou un
// litige déjà en cours — il y a de l'argent en séquestre derrière, et masquer
// une contrepartie à ce stade rendrait la transaction impossible à terminer :
// l'acheteur ne pourrait plus confirmer la réception, donc le vendeur ne serait
// jamais payé. Bloquer quelqu'un cache ce qu'il publie, pas ce qu'on lui doit.
// └──────────────────────────────────────────────────────────────────────────┘
import type { SupabaseClient } from '@shared/db.ts';

/**
 * Les identifiants que l'appelant ne doit plus voir. Vide pour un appelant
 * anonyme — la découverte publique n'a personne à masquer.
 */
export async function loadBlockedIds(
  sb: SupabaseClient,
  callerId: string | null,
): Promise<Set<string>> {
  if (!callerId) return new Set();
  // GARDE D'INJECTION. .or() construit un filtre PostgREST par concatenation de
  // chaine : une valeur contenant une virgule ou une parenthese y changerait la
  // requete. callerId vient d'un JWT que nous signons nous-memes, donc c'est
  // deja un UUID, mais cette famille de filtre ne merite pas qu'on s'en
  // remette a la provenance.
  if (!/^[0-9a-f-]{36}$/i.test(callerId)) return new Set();
  const { data, error } = await sb
    .from('blocked_users')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${callerId},blocked_id.eq.${callerId}`);
  if (error) {
    // ON NE FAIT PAS ÉCHOUER LA LECTURE. Une liste d'annonces qui renvoie 500
    // parce que la table de blocage a hoqueté serait une régression bien plus
    // visible que le blocage lui-même. On journalise et on rend un ensemble
    // vide : le pire cas est de montrer un contenu qu'on aurait dû masquer, sur
    // une requête, pas de casser l'écran.
    console.error('[blocks] lecture impossible:', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const r of (data as { blocker_id: string; blocked_id: string }[] | null) ?? []) {
    out.add(r.blocker_id === callerId ? r.blocked_id : r.blocker_id);
  }
  return out;
}

/**
 * Les boutiques des personnes bloquées. Les produits ne portent pas
 * d'`owner_id` — seulement un `shop_id` — alors que les biens immobiliers ont
 * les deux. Il faut donc ce détour pour masquer le catalogue d'un vendeur
 * bloqué, et pas seulement ses commentaires.
 *
 * Rend un ensemble vide quand il n'y a personne à masquer, ce qui est le cas de
 * la quasi-totalité des appels : aucune requête supplémentaire n'est émise dans
 * ce cas, et le chemin le plus chaud de l'application ne paie rien pour une
 * fonctionnalité que presque personne n'utilise.
 */
export async function loadBlockedShopIds(
  sb: SupabaseClient,
  blockedUserIds: Set<string>,
): Promise<Set<string>> {
  if (blockedUserIds.size === 0) return new Set();
  const { data, error } = await sb
    .from('shops')
    .select('id')
    .in('owner_id', [...blockedUserIds]);
  if (error) {
    console.error('[blocks] boutiques bloquees:', error);
    return new Set();
  }
  return new Set(((data as { id: string }[] | null) ?? []).map((s) => s.id));
}
