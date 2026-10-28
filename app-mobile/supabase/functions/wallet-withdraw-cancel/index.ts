// Le vendeur annule SON retrait — tant que l'argent n'est pas parti.
//
// ┌─ POURQUOI LA REGLE VIT EN BASE ET PAS ICI ──────────────────────────────┐
// Annuler un retrait deja verse ferait payer Linky deux fois : le vendeur
// garderait le virement ET recupererait son solde. La seule chose qui l'empeche
// est le verrou de ligne pris par `cancel_withdrawal`, le MEME que prennent le
// versement Lengopay (`claim_withdrawal_for_payout`) et la reservation d'un
// virement manuel. Lire l'etat ici puis agir laisserait une fenetre entre les
// deux. Cette fonction ne fait donc que traduire les refus.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Body     : { request_id: string }
// Reponse  : { withdrawal: { id, status, amount_minor, ... } }
//
// Erreurs :
//   REQUEST_NOT_FOUND   404  inconnue, ou celle d'un autre
//   REQUEST_CLOSED      409  deja payee / refusee / annulee
//   PAYOUT_IN_PROGRESS  409  l'argent est deja en route
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { request_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.request_id === 'string' && UUID_RE.test(x.request_id);
}

Deno.serve(makePost<Body>('/v1/wallet/withdraw-cancel', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb.rpc('cancel_withdrawal', {
    p_request_id: body.request_id,
    p_user_id: userId,
  });
  if (error) {
    const msg = (error as { message?: string } | null)?.message ?? '';
    console.error('[wallet-withdraw-cancel] rpc error:', error);
    if (msg.includes('request_not_found')) {
      throwApi('REQUEST_NOT_FOUND', 404, 'Retrait introuvable.');
    }
    if (msg.includes('request_closed') || msg.includes('already_released')) {
      throwApi('REQUEST_CLOSED', 409, 'Ce retrait est déjà traité.');
    }
    if (msg.includes('payout_in_progress')) {
      throwApi('PAYOUT_IN_PROGRESS', 409,
        'L\'argent est déjà en route vers votre Mobile Money : ce retrait ne peut plus être annulé.');
    }
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) {
    console.error('[wallet-withdraw-cancel] rpc returned no row');
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return {
    body: {
      withdrawal: {
        id: row.id,
        currency: row.currency,
        amount_minor: row.amount_minor,
        status: row.status,
        destination: row.destination,
        created_at: row.created_at,
        decided_at: row.decided_at,
      },
    },
  };
}));
