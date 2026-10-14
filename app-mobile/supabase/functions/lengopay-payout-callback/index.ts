// Rappel de Lengopay apres un versement — point d'entree PUBLIC.
//
// ┌─ ON NE CROIT PAS CE RAPPEL ─────────────────────────────────────────────┐
// Leur rappel n'est PAS signe : aucun en-tete de signature n'existe dans leur
// documentation (relevee le 2026-10-14). N'importe qui connaissant cette URL
// pourrait donc poster { status: "SUCCESS" } et faire marquer un retrait paye
// alors qu'aucun argent n'a bouge.
//
// Le rappel ne sert donc QUE DE SIGNAL. A sa reception :
//   1. on verifie que le pay_id est un de CEUX QU'ON A CREES
//   2. on demande le vrai statut a Lengopay (getPayoutStatus)
//   3. on n'agit que sur LEUR reponse, jamais sur le corps recu
//
// Un pay_id inconnu est ignore en silence, avec un 200 — ne rien reveler a
// qui sonde l'URL, et ne pas faire rejouer Lengopay indefiniment.
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ LES CODES DE RETOUR, ET CE QU'ILS DECLENCHENT CHEZ EUX ────────────────┐
// Leur documentation dit : « si la notification echoue, le serveur reessaiera
// pendant une periode limitee ». Donc :
//   200  -> ils arretent. Pour un succes traite, ET pour un pay_id inconnu.
//   500  -> ils REESSAIENT. Reserve aux pannes de notre cote (base,
//           Lengopay injoignable) : on veut le rejeu dans ce cas.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Deployer avec --no-verify-jwt : Lengopay n'envoie aucun jeton.
import { serviceClient } from '@shared/db.ts';
import { getPayoutStatus } from '@shared/lengopay.ts';

/** Leur pay_id s'ecrit differemment selon l'endpoint (avec ou sans le « = »
 *  de bourrage base64). On cherche donc sous toutes ses formes. */
function variantes(payId: string): string[] {
  const nu = payId.replace(/=+$/, '');
  return [...new Set([payId, nu, nu + '='])];
}

const ok = (m: string) => new Response(JSON.stringify({ ok: true, m }), {
  status: 200, headers: { 'content-type': 'application/json' },
});
const rejoue = (m: string) => new Response(JSON.stringify({ ok: false, m }), {
  status: 500, headers: { 'content-type': 'application/json' },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return ok('ignored');

  let payIdRecu = '';
  let messageRecu = '';
  try {
    const corps = await req.json() as { pay_id?: unknown; message?: unknown };
    payIdRecu = typeof corps.pay_id === 'string' ? corps.pay_id.trim() : '';
    // ⚠ Ce message vient du rappel NON SIGNE. Il ne decide de RIEN : il est
    // seulement recopie dans le motif, pour qu'un administrateur ait un
    // debut d'explication. L'etiquette « rappel » le rappelle a la lecture.
    messageRecu = typeof corps.message === 'string' ? corps.message.trim() : '';
  } catch {
    return ok('corps illisible');
  }
  if (!payIdRecu) return ok('sans pay_id');

  const sb = serviceClient();

  // ── 1. Est-ce un versement QU'ON A LANCE ? ────────────────────────────
  const { data: lignes, error: lookupErr } = await sb
    .from('withdrawal_requests')
    .select('id, status, payout_status, amount_minor')
    .in('payout_pay_id', variantes(payIdRecu))
    .limit(1);
  if (lookupErr) {
    console.error('[payout-callback] lookup error:', lookupErr);
    return rejoue('base indisponible');
  }
  const demande = lignes?.[0] as
    { id: string; status: string; payout_status: string | null; amount_minor: number | string } | undefined;
  if (!demande) {
    // Inconnu : on acquitte sans rien reveler. Ce n'est pas une erreur de
    // leur cote, inutile qu'ils rejouent.
    console.warn('[payout-callback] pay_id inconnu:', payIdRecu.slice(0, 24));
    return ok('inconnu');
  }

  // Deja conclu : rejeu tardif, rien a faire. Idempotent par construction.
  if (demande.status === 'paid' || demande.payout_status === 'SUCCESS') {
    return ok('deja traite');
  }

  // ── 2. LA VERITE VIENT DE LENGOPAY, PAS DU CORPS RECU ─────────────────
  let verite: Awaited<ReturnType<typeof getPayoutStatus>>;
  try {
    verite = await getPayoutStatus(payIdRecu);
  } catch (e) {
    console.error('[payout-callback] getPayoutStatus failed:', e);
    return rejoue('statut Lengopay injoignable');   // qu'ils rejouent
  }
  if (!verite) {
    console.warn('[payout-callback] Lengopay ne connait pas ce pay_id:', payIdRecu.slice(0, 24));
    return ok('introuvable chez Lengopay');
  }

  const statut = verite.status.toUpperCase();

  // ── 3. AGIR ───────────────────────────────────────────────────────────
  if (statut === 'SUCCESS') {
    // La cloture passe par `process_withdrawal`, EXACTEMENT comme la console
    // d'administration l'appelle. On ne reecrit pas la logique d'argent ; on
    // emprunte le chemin deja eprouve.
    //
    // Elle exige un administrateur. Le compte unique d'administration sert
    // d'acteur, et le motif dit que c'est le systeme qui a agi — l'audit
    // reste honnete.
    const { data: admins, error: adminErr } = await sb
      .from('users').select('id').eq('is_admin', true).limit(1);
    if (adminErr || !admins?.[0]) {
      console.error('[payout-callback] aucun admin pour clore:', adminErr);
      return rejoue('aucun administrateur');
    }

    const { error: rpcErr } = await sb.rpc('process_withdrawal', {
      p_request_id: demande.id,
      p_admin_id:   (admins[0] as { id: string }).id,
      p_outcome:    'paid',
      p_reason:     `Versement Lengopay automatique — pay_id ${payIdRecu.slice(0, 48)}`,
    });
    if (rpcErr) {
      console.error('[payout-callback] process_withdrawal failed:', rpcErr);
      return rejoue('cloture impossible');
    }

    await sb.from('withdrawal_requests')
      .update({ payout_status: 'SUCCESS', payout_error: null })
      .eq('id', demande.id);
    return ok('paye');
  }

  if (statut === 'FAILED') {
    // Le versement n'a PAS eu lieu : les fonds sont toujours retenus, la
    // demande reste 'approved'. On enregistre le motif et on s'arrete la.
    //
    // ⚠ On ne relance PAS automatiquement. La reservation reste posee, donc
    // un second versement est impossible tant qu'un humain n'a pas regarde.
    // C'est volontaire : rejouer tout seul sur un echec qu'on ne comprend pas
    // est le meilleur moyen de payer deux fois le jour ou leur « FAILED »
    // n'en est pas un.
    await sb.from('withdrawal_requests')
      .update({
        payout_status: 'FAILED',
        payout_error: `Lengopay a refusé le versement (rappel : ${(messageRecu || 'sans détail').slice(0, 300)})`,
      })
      .eq('id', demande.id);
    return ok('echec enregistre');
  }

  // INITIATED ou un statut qu'on ne connait pas : on note et on attend le
  // prochain rappel. Acquitter, sinon ils rejouent pour rien.
  await sb.from('withdrawal_requests')
    .update({ payout_status: statut })
    .eq('id', demande.id);
  return ok(`statut ${statut}`);
});
