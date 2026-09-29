// Phase S — admin withdrawals queue.
//
// Body : { scope?: 'pending' | 'recent' }   (default 'pending')
//   pending → pending requests, oldest first (work queue order), each with
//             the seller's CURRENT balance ON THE WALLET THE REQUEST TARGETS
//             (balance_minor, choisi par `wallet_kind`) so the console can flag
//             "balance no longer covers this request".
//             ⚠️ Depuis 20260929_08, une demande `approved` a DEJA retenu ses
//             fonds : le solde en exclut la retenue, et la comparaison ne vaut
//             que pour les demandes `pending` d'avant ce changement.
//   recent  → paid / rejected requests decided in the last 7 days, newest first.
// Response : { withdrawals: WithdrawalRow[] }
//
// Auth : requireUser + assertAdmin (live is_admin re-check, Phase K posture).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body {
  scope?: 'pending' | 'recent';
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.scope === undefined || x.scope === 'pending' || x.scope === 'recent';
}

const SELECT =
  // `wallet_kind` : la caisse que process_withdrawal debitera. C'est ELLE dont
  // il faut montrer le solde, pas « une » caisse de ce vendeur.
  'id, user_id, currency, amount_minor, status, destination, reason, wallet_kind, ' +
  'created_at, decided_at, decided_by, ' +
  'users:users!withdrawal_requests_user_id_fkey(id, display_name, avatar_url)';

interface WithdrawalRow {
  id: string;
  user_id: string;
  currency: string;
  amount_minor: number | string;
  status: string;
  [key: string]: unknown;
}

Deno.serve(makePost<Body>('/v1/admin/withdrawals/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const scope = body.scope ?? 'pending';
  let query = sb.from('withdrawal_requests').select(SELECT);

  if (scope === 'pending') {
    // LA FILE, C'EST CE QU'IL RESTE A PAYER.
    //
    // 'approved' depuis le 2026-09-28 : la demande se valide toute seule et les
    // fonds sont deja retenus, l'administrateur n'a plus qu'a envoyer l'argent.
    // 'pending' reste inclus pour les demandes d'AVANT ce changement, qui
    // attendent encore une decision humaine — les deux regimes coexistent et il
    // n'y a aucune reprise de donnees a faire.
    query = query
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: true });
  } else {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    query = query
      .in('status', ['paid', 'rejected'])
      .gte('decided_at', cutoff)
      .order('decided_at', { ascending: false });
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[list-withdrawals] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data ?? []) as unknown as WithdrawalRow[];

  if (scope === 'pending' && rows.length > 0) {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: balances, error: balErr } = await sb.rpc('get_wallet_balances_bulk', {
      p_user_ids: userIds,
    });
    if (balErr) {
      console.error('[list-withdrawals] balances error:', balErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    // ┌─ LA CAISSE FAIT PARTIE DE LA CLE, ET CE N'EST PAS UN DETAIL ────────┐
    // Depuis la separation du 2026-09-24, un vendeur peut avoir DEUX
    // portefeuilles en GNF : `seller` et `immo`. La RPC rend une ligne par
    // portefeuille ; ranger le resultat par `user_id:currency` ecrasait donc
    // l'un par l'autre, et gardait celui que le plan d'execution avait sorti en
    // dernier. Au hasard.
    //
    // Consequence mesuree le 2026-09-29 : un vendeur avec seller=96 800 et
    // immo=4 000 s'est vu attribuer 4 000. La console affichait « SOLDE
    // INSUFFISANT » sur ses demandes de 50 000 et DESACTIVAIT « Marquer paye ».
    // Impossible de payer quelqu'un qui avait l'argent.
    // └────────────────────────────────────────────────────────────────────┘
    const byWallet = new Map<string, number>();
    for (const b of (balances ?? []) as Array<{
      user_id: string;
      kind: string;
      currency: string;
      balance_minor: number | string;
    }>) {
      byWallet.set(`${b.user_id}:${b.kind}:${b.currency}`, Number(b.balance_minor));
    }
    for (const r of rows) {
      // `wallet_kind` a un defaut en base ; le repli ne sert qu'aux lignes
      // anterieures a la colonne, et vaut la caisse que tout le monde possede.
      const kind = (r.wallet_kind as string | undefined) ?? 'seller';
      // Pas de portefeuille = rien n'a jamais ete credite = solde 0.
      r.balance_minor = byWallet.get(`${r.user_id}:${kind}:${r.currency}`) ?? 0;
    }
  }

  return { body: { withdrawals: rows } };
}));
