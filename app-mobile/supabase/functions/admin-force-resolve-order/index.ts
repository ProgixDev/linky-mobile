// Debloquer une commande dont l'acheteur ne dit plus rien.
//
// CE QUE CETTE FONCTION COMBLE. resolve-dispute exige le statut 'disputed', et
// rien ne permet de mettre une commande en litige a la place de l'acheteur.
// Une commande payee dont l'acheteur se tait n'avait donc AUCUNE issue : ni
// pour lui, ni pour le vendeur, ni pour un administrateur. L'argent restait au
// sequestre indefiniment. Trois commandes etaient dans cet etat le 2026-09-07.
//
// Le balayage nocturne (expire_stale_escrows) automatise le cas evident et
// ecarte volontairement tout ce qui merite un regard : montant au-dessus du
// plafond, livraison deja engagee, solde de sequestre incoherent, acheteur
// deja rembourse plusieurs fois. C'est ICI qu'atterrissent ces cas — et c'est
// cette porte qui rend la prudence du balayage tenable.
//
// Elle refuse les commandes 'disputed' : celles-la passent par resolve-dispute,
// qui porte le seuil des deux administrateurs au-dela de 5 M GNF. Deux portes
// vers le meme argent, dont une sans ce seuil, le contournerait.
//
// PAS DE NOTIFICATION ICI, a la difference de resolve-dispute : la RPC
// admin_force_resolve_order ecrit elle-meme les avis aux deux parties, en SQL,
// parce que le balayage nocturne appelle le meme chemin depuis pg_cron et ne
// peut appeler aucune fonction edge. Notifier une seconde fois d'ici ferait
// deux lignes pour un seul evenement.
//
// Carte des erreurs (libelle SQL -> code HTTP) :
//   not_admin             -> 403  garde vivante dans la RPC
//   invalid_outcome       -> 400  attendu refund ou release
//   reason_required       -> 400  un geste hors du cours normal doit s'expliquer
//   order_not_found       -> 404
//   use_resolve_dispute   -> 400  commande en litige : mauvaise porte
//   invalid_status        -> 400  commande deja close, ou jamais payee
//   self_deal_forbidden   -> 400  l'admin est partie a l'affaire
//   escrow_mismatch       -> 409  les comptes ne tombent pas juste : on ne
//                                 devine pas avec de l'argent
//   INSUFFICIENT_FUNDS    -> 409  le sequestre a ete vide entre-temps
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body {
  order_id: string;
  outcome: 'refund' | 'release';
  reason: string;
}

const OUTCOMES = new Set(['refund', 'release']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.order_id)) return false;
  if (typeof x.outcome !== 'string' || !OUTCOMES.has(x.outcome)) return false;
  // Le motif est OBLIGATOIRE ici, alors qu'il est facultatif sur resolve-dispute.
  // Un litige porte deja sa propre trace : l'acheteur a explique pourquoi il
  // contestait. Ce geste-ci n'en a aucune — sans motif, personne ne saura dans
  // six mois pourquoi cet argent a bouge.
  if (typeof x.reason !== 'string' || x.reason.trim().length < 3 || x.reason.length > 500) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/orders/force-resolve', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const { error: rpcErr } = await sb.rpc('admin_force_resolve_order', {
    p_order_id: body.order_id,
    p_admin_id: userId,
    p_outcome:  body.outcome,
    p_reason:   body.reason.trim(),
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[admin-force-resolve-order] rpc error:', rpcErr);
    if (msg.includes('not_admin'))           throwApi('FORBIDDEN_ADMIN',     403, 'Accès admin requis.');
    if (msg.includes('invalid_outcome'))     throwApi('INVALID_OUTCOME',     400, 'Verdict invalide (refund ou release).');
    if (msg.includes('reason_required'))     throwApi('REASON_REQUIRED',     400, 'Un motif est obligatoire.');
    if (msg.includes('order_not_found'))     throwApi('ORDER_NOT_FOUND',     404, 'Commande introuvable.');
    if (msg.includes('use_resolve_dispute')) throwApi('USE_RESOLVE_DISPUTE', 400, 'Cette commande est en litige : utilisez la résolution de litige.');
    if (msg.includes('invalid_status'))      throwApi('INVALID_STATUS',      400, "Cette commande n'est pas déblocable (déjà close, ou jamais payée).");
    if (msg.includes('self_deal_forbidden')) throwApi('FORBIDDEN_SELF_DEAL', 400, "Vous ne pouvez pas trancher une commande dont vous êtes acheteur ou vendeur.");
    if (msg.includes('escrow_mismatch'))     throwApi('ESCROW_MISMATCH',     409, "Le solde du séquestre ne correspond pas au total de la commande. Vérification comptable requise avant tout mouvement.");
    if (msg.includes('INSUFFICIENT_FUNDS'))  throwApi('ESCROW_EMPTY',        409, 'Le séquestre ne détient plus les fonds de cette commande.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur déblocage commande');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .single();
  if (readErr || !row) {
    console.error('[admin-force-resolve-order] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  return {
    body: {
      ok: true,
      order: mapOrder(row as OrderRow, { includeAdminMeta: true }),
    },
  };
}));
