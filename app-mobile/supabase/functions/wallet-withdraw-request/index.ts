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

// LA DEMANDE EST VALIDEE ET LES FONDS SONT RETENUS, EN UN SEUL GESTE.
//
// ┌─ POURQUOI CETTE FONCTION NE FAIT PLUS RIEN ELLE-MEME ───────────────────┐
// Elle lisait le solde, le comparait, puis inserait la ligne — trois gestes
// separes, sans verrou. Deux demandes simultanees lisaient donc le MEME solde
// et passaient toutes les deux. Et rien n'etait retenu : le debit n'avait lieu
// que lorsque l'administrateur cochait " paye ", c'est-a-dire APRES avoir
// envoye l'argent pour de vrai. Entre les deux, le vendeur pouvait depenser
// son solde, et la perte etait pour Linky.
//
// `request_withdrawal` fait les trois sous un `for update` sur le portefeuille,
// pose la demande en `approved` et ecrit la retenue dans le meme mouvement.
// C'est ce qui permet au back-office de n'etre plus qu'un tableau de suivi
// (demande du client, 2026-09-28) : il n'a plus a decider, seulement a envoyer
// l'argent et a le confirmer.
//
// ⚠️ Le VIREMENT reste manuel, et ce n'est pas un oubli : il faudrait une API
// de decaissement, et Lengopay n'expose que de l'encaissement (mesure du
// 2026-09-28, dix-sept routes, toutes entrantes).
// └─────────────────────────────────────────────────────────────────────────┘
Deno.serve(makePost<Body>(
  '/v1/wallet/withdraw-request',
  valid,
  async ({ sb, body, req }) => {
    const userId = await requireUser(req);
    const { data, error } = await sb.rpc('request_withdrawal', {
      p_user_id:      userId,
      p_currency:     body.currency,
      p_amount_minor: body.amount_minor,
      p_destination:  body.destination.trim(),
      // La caisse VENDEUR : c'est celle que l'application affiche et la seule
      // qu'un retrait vide aujourd'hui. La RPC accepte 'immo' pour le jour ou
      // l'ecran saura la choisir.
      p_wallet_kind:  'seller',
    });
    if (error) {
      const msg = (error as { message?: string } | null)?.message ?? '';
      console.error('[wallet-withdraw-request] rpc error:', error);
      if (msg.includes('insufficient_funds')) {
        throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour ce retrait.');
      }
      if (msg.includes('destination_required')) {
        throwApi('DESTINATION_REQUIRED', 400, 'Indique le numéro qui doit recevoir l\'argent.');
      }
      if (msg.includes('invalid_amount')) {
        throwApi('INVALID_AMOUNT', 400, 'Montant invalide.');
      }
      if (msg.includes('invalid_currency') || msg.includes('invalid_wallet_kind')) {
        throwApi('INVALID_BODY', 400, 'Corps invalide');
      }
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) {
      console.error('[wallet-withdraw-request] rpc returned no row');
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    // On rend les MEMES champs qu'avant : l'ecran n'a rien a reapprendre.
    return {
      body: {
        withdrawal: {
          id: row.id,
          currency: row.currency,
          amount_minor: row.amount_minor,
          status: row.status,
          destination: row.destination,
          created_at: row.created_at,
        },
      },
    };
  },
));
