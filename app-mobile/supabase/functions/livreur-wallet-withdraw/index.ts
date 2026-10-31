// Le livreur retire l'argent de ses livraisons (client 2026-10-31).
//
// Meme machinerie que le retrait d'un vendeur, sur la caisse 'livreur' :
// `request_withdrawal` valide, verrouille la caisse, retient les fonds et pose
// la demande en 'approved'. Elle arrive ensuite dans la console des retraits
// comme les autres — versement Lengopay ou virement manuel, annulation tant
// que l'argent n'est pas parti (wallet-withdraw-cancel, generique).
//
// Body     : { amount_minor: number, destination: string }
// Reponse  : { withdrawal: { id, amount_minor, status, destination, created_at } }
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { amount_minor: number; destination: string }

// La meme regle que wallet-withdraw-request : un NUMERO (huit chiffres au
// moins), pas une mise en forme. C'est le numero qui rend la demande payable.
function hasPayableDestination(x: unknown): boolean {
  if (typeof x !== 'string') return false;
  const d = x.trim();
  if (d.length < 6 || d.length > 128) return false;
  return (d.match(/\d/g) ?? []).length >= 8;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Body;
  return typeof x.amount_minor === 'number' && Number.isInteger(x.amount_minor) && x.amount_minor > 0
    && x.amount_minor <= 100_000_000_000
    && hasPayableDestination(x.destination);
}

Deno.serve(makePost<Body>('/v1/livreur/wallet/withdraw', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb.rpc('request_withdrawal', {
    p_user_id:      userId,
    p_currency:     'GNF',
    p_amount_minor: body.amount_minor,
    p_destination:  body.destination.trim(),
    p_wallet_kind:  'livreur',
  });
  if (error) {
    const msg = (error as { message?: string } | null)?.message ?? '';
    console.error('[livreur-wallet-withdraw] rpc error:', error);
    if (msg.includes('insufficient_funds')) {
      throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour ce retrait.');
    }
    if (msg.includes('destination_required')) {
      throwApi('DESTINATION_REQUIRED', 400, 'Indique le numéro qui doit recevoir l\'argent.');
    }
    if (msg.includes('invalid_amount')) throwApi('INVALID_AMOUNT', 400, 'Montant invalide.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) {
    console.error('[livreur-wallet-withdraw] rpc returned no row');
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  return {
    body: {
      withdrawal: {
        id: row.id,
        amount_minor: Number(row.amount_minor),
        status: row.status,
        destination: row.destination,
        created_at: row.created_at,
      },
    },
  };
}));
