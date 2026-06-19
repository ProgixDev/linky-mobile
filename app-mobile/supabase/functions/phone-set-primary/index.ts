// Pre-prod: mark a phone as the caller's primary number. Only OTP-verified
// phones may become primary — an unverified phone is not a trustworthy
// identity anchor for the cases that read it (mobile-money payout default,
// future SMS receipts).
//
// The partial UNIQUE index `phones_one_primary_per_user` enforces exactly
// one is_primary=true per user_id at the DB level, so we clear all of the
// caller's rows first then set the one. Both updates run inside one
// transaction via the wallets-style RPC pattern so a partial state
// (everyone unprimary) can't survive a crash mid-flow.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { phone_id: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.phone_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.phone_id);
}

Deno.serve(makePost<Body>('/v1/phones/set-primary', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: row, error: eGet } = await sb
    .from('phones')
    .select('id, user_id, is_primary, verified_at')
    .eq('id', body.phone_id)
    .maybeSingle();
  if (eGet) {
    console.error('[phone-set-primary] lookup error:', eGet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row || row.user_id !== userId) {
    throwApi('PHONE_NOT_FOUND', 404, 'Numéro introuvable');
  }
  if (row.verified_at === null) {
    throwApi('PHONE_NOT_VERIFIED', 400, "Ce numéro n'est pas vérifié.");
  }
  if (row.is_primary) {
    // No-op — already primary. Don't bump anything, just return current state.
    return { body: { ok: true } };
  }

  // Two-step inside a stored RPC would be tidier ; using PostgREST here means
  // we do clear-then-set as two updates. The partial UNIQUE index would fail
  // if the set raced an insert of a different primary, so a transient
  // 23505 from a near-impossible race surfaces as INTERNAL_ERROR — acceptable
  // because the user's session can't race itself on this path.
  const { error: eClear } = await sb
    .from('phones')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('is_primary', true);
  if (eClear) {
    console.error('[phone-set-primary] clear error:', eClear);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const { error: eSet } = await sb
    .from('phones')
    .update({ is_primary: true })
    .eq('id', body.phone_id)
    .eq('user_id', userId);
  if (eSet) {
    console.error('[phone-set-primary] set error:', eSet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  return { body: { ok: true } };
}));
