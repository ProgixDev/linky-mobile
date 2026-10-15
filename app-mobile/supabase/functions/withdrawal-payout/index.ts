// Verser un retrait par Lengopay, au lieu de le virer a la main.
//
// ┌─ L'ORDRE DES GESTES, ET POURQUOI IL NE PEUT PAS CHANGER ────────────────┐
// L'API de versement de Lengopay n'a AUCUNE cle d'idempotence : un appel parti
// deux fois PAIE deux fois. Donc :
//
//   1. RESERVER d'abord, sous verrou  (claim_withdrawal_for_payout)
//   2. seulement ensuite, appeler Lengopay
//   3. rattacher leur pay_id          (attach_withdrawal_payout)
//
// Reserver APRES l'appel laisserait une fenetre ou deux executions
// simultanees partiraient toutes les deux. La reservation est la premiere
// chose qui se fait, et elle est verrouillee en base.
//
// Si l'appel echoue AVANT d'avoir un pay_id, on relache la reservation pour
// que la demande reste re-essayable. S'il echoue APRES, on ne relache PAS :
// Lengopay a peut-etre paye malgre notre erreur, et le rattrapage s'en
// chargera (listPayoutTransactions).
// └─────────────────────────────────────────────────────────────────────────┘
//
// Cette fonction NE marque PAS la demande payee. C'est le rappel, verifie
// aupres de Lengopay, qui le fera — en passant par `process_withdrawal`,
// exactement comme la console le fait deja.
//
// Body     : { request_id: string }
// Reponse  : { ok: true, pay_id, status }
//
// Erreurs :
//   FORBIDDEN_ADMIN        403  pas admin
//   REQUEST_NOT_FOUND      404  demande inconnue
//   REQUEST_NOT_PAYABLE    409  la demande n'attend pas de virement
//   PAYOUT_ALREADY_CLAIMED 409  un versement est deja parti pour elle
//   DESTINATION_UNUSABLE   422  on ne sait pas vers OU verser (voir le motif)
//   INSUFFICIENT_FLOAT     409  la caisse Pay Out ne couvre pas le montant
//   PAYOUT_FAILED          502  Lengopay a refuse l'appel
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { requestPayout, getAccountBalance } from '@shared/lengopay.ts';
import { parseWithdrawalDestination, expliquerRefus } from '@shared/withdrawal-destination.ts';

interface Body { request_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.request_id === 'string' && UUID_RE.test(x.request_id);
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  currency: string;
  amount_minor: number | string;
  status: string;
  destination: string | null;
}

Deno.serve(makePost<Body>('/v1/admin/withdrawals/payout', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  // ── 1. RESERVER. Rien ne part avant que cette ligne soit verrouillee. ──
  const { data: claimed, error: claimErr } = await sb.rpc('claim_withdrawal_for_payout', {
    p_request_id: body.request_id,
  });
  if (claimErr) {
    const m = (claimErr as { message?: string } | null)?.message ?? '';
    console.error('[withdrawal-payout] claim error:', claimErr);
    if (m.includes('request_not_found'))      throwApi('REQUEST_NOT_FOUND', 404, 'Demande de retrait introuvable.');
    if (m.includes('request_not_payable'))    throwApi('REQUEST_NOT_PAYABLE', 409, 'Cette demande n’attend pas de virement.');
    if (m.includes('payout_already_claimed')) throwApi('PAYOUT_ALREADY_CLAIMED', 409, 'Un versement est déjà parti pour cette demande.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur réservation du versement');
  }
  const row = (Array.isArray(claimed) ? claimed[0] : claimed) as WithdrawalRow | undefined;
  if (!row) throwApi('INTERNAL_ERROR', 500, 'Erreur réservation du versement');

  const montant = Number(row.amount_minor);

  // A partir d'ici, TOUT echec doit relacher la reservation — sinon la demande
  // reste bloquee pour toujours, invisible dans la file.
  const relacher = async (motif: string) => {
    const { error } = await sb.rpc('release_withdrawal_payout_claim', {
      p_request_id: body.request_id,
      p_error: motif,
    });
    if (error) console.error('[withdrawal-payout] release failed:', error);
  };

  // ── 2. VERS OU ? Si on ne sait pas, on ne devine pas. ──────────────────
  const cible = parseWithdrawalDestination(row.destination);
  if (!cible.ok) {
    const motif = expliquerRefus(cible.reason);
    await relacher(motif);
    throwApi('DESTINATION_UNUSABLE', 422, `Versement automatique impossible : ${motif}`);
  }

  // ── 3. LA CAISSE COUVRE-T-ELLE ? ───────────────────────────────────────
  // Leur API ne dit pas ce qu'elle fait d'un versement a decouvert. On refuse
  // avant plutot que de decouvrir apres. Un solde illisible n'est PAS un
  // motif de blocage : on journalise et on continue.
  //
  // ⚠ C'EST `payoutGnf` QU'IL FAUT LIRE, PAS `amountGnf`.
  // getAccountBalance() rend DEUX caisses : `amountGnf` est « Pay In »,
  // l'argent ENCAISSE, et `payoutGnf` est « Pay Out », celle qui PAIE les
  // vendeurs. Les confondre fait refuser un versement finançable : au
  // 2026-10-15, Pay In valait 4 057 GNF et Pay Out 60 000 — un versement de
  // 10 000 aurait été rejeté à tort. Premiere version de cette fonction :
  // elle lisait amountGnf.
  //
  // `payoutGnf` absent ou nul = ils ne rendent pas la caisse. On ne bloque
  // PAS sur une mesure qu'on n'a pas : on journalise et on laisse passer.
  try {
    const solde = await getAccountBalance();
    if (solde.available && solde.payoutGnf != null && solde.payoutGnf < montant) {
      await relacher(`Caisse Pay Out insuffisante : ${solde.payoutGnf} < ${montant}`);
      throwApi('INSUFFICIENT_FLOAT', 409,
        'La caisse de versement Lengopay ne couvre pas ce montant. Alimente-la puis réessaie.');
    }
  } catch (e) {
    if ((e as { status?: number })?.status) throw e;   // notre propre throwApi
    console.error('[withdrawal-payout] solde illisible, on continue:', e);
  }

  // ── 4. VERSER ──────────────────────────────────────────────────────────
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const callback = base ? `${base}/functions/v1/lengopay-payout-callback` : undefined;

  let payId: string;
  let statut: string;
  try {
    const rep = await requestPayout({
      amount_minor: montant,
      currency: row.currency,
      account: cible.target.account,
      type_account: cible.target.type_account,
      callback_url: callback,
    });
    payId = rep.pay_id;
    statut = rep.status;
  } catch (e) {
    // Echec AVANT d'avoir un pay_id : rien n'est parti, on relache.
    const motif = (e as Error)?.message ?? 'appel Lengopay échoué';
    console.error('[withdrawal-payout] requestPayout failed:', e);
    await relacher(motif.slice(0, 400));
    throwApi('PAYOUT_FAILED', 502, 'Lengopay a refusé le versement. La demande reste à traiter.');
  }

  // ── 5. RATTACHER leur identifiant ──────────────────────────────────────
  // ⚠ A partir d'ici on ne relache PLUS : le versement est parti. Si cette
  // ecriture echoue, le rattrapage retrouvera le versement chez eux.
  const { error: attachErr } = await sb.rpc('attach_withdrawal_payout', {
    p_request_id: body.request_id,
    p_pay_id: payId,
    p_status: statut,
  });
  if (attachErr) {
    console.error('[withdrawal-payout] ATTACH FAILED — versement parti, pay_id non enregistre:',
      { request_id: body.request_id, pay_id: payId, error: attachErr });
    throwApi('INTERNAL_ERROR', 500,
      'Le versement est parti mais n’a pas pu être enregistré. Vérifie dans Lengopay avant toute nouvelle tentative.');
  }

  return { body: { ok: true, pay_id: payId, status: statut } };
}));
