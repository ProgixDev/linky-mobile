import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { currency: 'GNF' | 'EUR'; amount_minor: number; destination: string }

/**
 * OU ENVOYER L'ARGENT — desormais OBLIGATOIRE.
 *
 * ┌─ POURQUOI CE DURCISSEMENT ──────────────────────────────────────────────┐
 * Le paiement est MANUEL : un administrateur lit la demande, envoie le
 * transfert mobile money depuis son propre telephone, puis revient la marquer
 * payee. Une demande sans destination est donc litteralement impayable — elle
 * s'assoit dans la file et il faut retrouver le vendeur pour lui demander son
 * numero.
 *
 * `destination` etait OPTIONNELLE et non validee (chaine libre <= 128). L'app
 * en envoie une depuis le 2026-06-15 (`${operateur} — ${numero}`), donc tous
 * les binaires en circulation sont couverts ; seul un appel forge pouvait
 * creer une demande vide. On ferme la porte plutot que de compter dessus.
 *
 * ON NE VALIDE PAS LE FORMAT, on valide qu'un NUMERO est la : huit chiffres au
 * moins. Exiger « Orange Money — 6XX XX XX XX » au caractere pres casserait le
 * jour ou le libelle d'un operateur change, et n'apporterait rien de plus —
 * c'est le numero qui rend la demande payable, pas sa mise en forme.
 * └─────────────────────────────────────────────────────────────────────────┘
 */
function hasPayableDestination(x: unknown): boolean {
  if (typeof x !== 'string') return false;
  const d = x.trim();
  if (d.length < 6 || d.length > 128) return false;
  return (d.match(/\d/g) ?? []).length >= 8;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Body;
  return (x.currency === 'GNF' || x.currency === 'EUR')
    && typeof x.amount_minor === 'number' && Number.isInteger(x.amount_minor) && x.amount_minor > 0
    && x.amount_minor <= 100_000_000_000
    && hasPayableDestination(x.destination);
}

// Records a PENDING withdrawal request after a read-only balance check. No debit happens here -
// V1 payout is manual; the ledger debit (post_external_debit) lands with the payments module.
Deno.serve(makePost<Body>(
  '/v1/wallet/withdraw-request',
  valid,
  async ({ sb, body, req }) => {
    const userId = await requireUser(req);
    const { data: balances, error: be } = await sb.rpc('get_wallet_balances', { p_user_id: userId });
    if (be) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    const row = ((balances ?? []) as Array<{ currency: string; balance_minor: number }>).find((x) => x.currency === body.currency);
    const bal = Number(row?.balance_minor ?? 0);
    if (bal < body.amount_minor) throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour ce retrait.');
    const { data, error } = await sb
      .from('withdrawal_requests')
      .insert({ user_id: userId, currency: body.currency, amount_minor: body.amount_minor, destination: body.destination.trim() })
      .select('id, currency, amount_minor, status, destination, created_at')
      .single();
    if (error || !data) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    return { body: { withdrawal: data } };
  },
));
