// Mock Lengopay v2 Cash-In rail for local dev and sandbox-absence work.
// Persists state in public.mock_lengopay_state so multiple cron-tick poll
// reads of the same intent return consistent status.
//
// Routes:
//   POST /init-payment        — synth pay_id, insert state row
//   GET  /status/<pay_id>     — compute status from age + magic phone
//
// Toggle: set LINKY_LENGOPAY_BASE_URL to <supabase-url>/functions/v1/mock-lengopay
//         in dev. Empty/unset in prod → real Lengopay URL.
//
// Reset mock between dev runs: DELETE FROM public.mock_lengopay_state;

import { serviceClient } from '@shared/db.ts';
import { corsHeaders, handlePreflight } from '@shared/cors.ts';
import { jsonResponse, apiError } from '@shared/errors.ts';
import type {
  LengopayInitRequest,
  LengopayInitResponse,
  LengopayStatusResponse,
  LengopayIntentStatus,
} from '@shared/lengopay-types.ts';

const AUTO_SUCCESS_AFTER_MS = 10_000;

interface MockState {
  intent_id: string;
  created_at: string;
  magic_phone: string | null;
  forced_outcome: 'fail_insufficient' | 'fail_wrong_number' | 'cancel' | null;
}

function classifyPhone(phone: string): MockState['forced_outcome'] {
  if (phone === '+224999999990') return 'fail_insufficient';
  if (phone === '+224888888880') return 'fail_wrong_number';
  if (phone === '+224777777770') return 'cancel';
  return null;
}

function computeStatus(state: MockState): { status: LengopayIntentStatus; code?: string; message: string } {
  const ageMs = Date.now() - new Date(state.created_at).getTime();
  if (state.forced_outcome === 'fail_insufficient') {
    if (ageMs < 5_000) return { status: 'pending', message: 'En attente de confirmation' };
    return { status: 'failed', code: 'INSUFFICIENT_BALANCE', message: 'Solde insuffisant sur le compte mobile money' };
  }
  if (state.forced_outcome === 'fail_wrong_number') {
    if (ageMs < 3_000) return { status: 'pending', message: 'En attente de confirmation' };
    return { status: 'failed', code: 'WRONG_NUMBER', message: 'Numéro non enregistré sur ce réseau Mobile Money' };
  }
  if (state.forced_outcome === 'cancel') {
    if (ageMs < 7_000) return { status: 'pending', message: 'En attente de confirmation' };
    return { status: 'cancelled', code: 'USER_CANCELLED', message: "Paiement annulé par l'utilisateur" };
  }
  if (ageMs < AUTO_SUCCESS_AFTER_MS) return { status: 'pending', message: 'En attente de confirmation' };
  return { status: 'success', message: 'Paiement reçu' };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const cors = corsHeaders(req);

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // pathname is /mock-lengopay/<route>... — drop the function-name prefix.
  const sub = segments.slice(1);

  const sb = serviceClient();

  // POST /init-payment
  if (req.method === 'POST' && sub[0] === 'init-payment') {
    let body: Partial<LengopayInitRequest>;
    try { body = await req.json(); }
    catch { return apiError('INVALID_BODY', 400, 'Corps JSON invalide', cors); }

    if (!body.account_number || !body.amount) {
      return apiError('INVALID_BODY', 400, 'account_number et amount requis', cors);
    }

    const pay_id = crypto.randomUUID();
    const forced_outcome = classifyPhone(body.account_number);

    const { error } = await sb.from('mock_lengopay_state').insert({
      intent_id: pay_id,
      magic_phone: body.account_number,
      forced_outcome,
    });
    if (error) {
      console.error('[mock-lengopay] init insert error:', error);
      return apiError('MOCK_DB_ERROR', 500, 'Erreur état mock', cors);
    }

    const response: LengopayInitResponse = {
      pay_id,
      status: 'pending',
      message: 'Intent créé (mock)',
    };
    return jsonResponse(response, 200, cors);
  }

  // GET /status/<pay_id>
  if (req.method === 'GET' && sub[0] === 'status' && sub[1]) {
    const { data, error } = await sb
      .from('mock_lengopay_state')
      .select('intent_id, created_at, magic_phone, forced_outcome')
      .eq('intent_id', sub[1])
      .maybeSingle();
    if (error) {
      console.error('[mock-lengopay] status read error:', error);
      return apiError('MOCK_DB_ERROR', 500, 'Erreur lecture état mock', cors);
    }
    if (!data) return apiError('NOT_FOUND', 404, 'Intent introuvable', cors);

    const { status, code, message } = computeStatus(data as MockState);
    const response: LengopayStatusResponse = {
      pay_id: sub[1],
      status,
      message,
      ...(code ? { error_code: code } : {}),
    };
    return jsonResponse(response, 200, cors);
  }

  return apiError('NOT_FOUND', 404, 'Route inconnue', cors);
});
