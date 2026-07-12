import { makePost, stripTokens } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { signAccessToken, randomRefreshToken } from '@shared/jwt.ts';
import { bcryptHash, bcryptCompare } from '@shared/bcrypt.ts';

interface Body { refresh_token: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.refresh_token === 'string' && x.refresh_token.includes('.');
}

const REFRESH_TTL_DAYS = 90;

Deno.serve(makePost<Body>('/v1/session/refresh', valid, async ({ sb, body, req }) => {
  const [sessionId, secret] = body.refresh_token.split('.', 2);
  if (!sessionId || !secret) throwApi('REFRESH_TOKEN_INVALID', 401, 'Token de rafraîchissement invalide');

  const { data: session, error: eSess } = await sb
    .from('sessions')
    .select('id, user_id, refresh_token_hash, expires_at, revoked_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (eSess) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!session) throwApi('REFRESH_TOKEN_INVALID', 401, 'Token de rafraîchissement invalide');
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throwApi('REFRESH_TOKEN_EXPIRED', 401, 'Session expirée');
  }

  // CRITICAL: bcryptCompare BEFORE the revoked check.
  // If we checked revoked_at first, an attacker who guesses a valid session UUID for a revoked
  // session could trigger a mass-logout of that user (denial-of-service). bcrypt first means
  // chain-kill only fires when the attacker actually has a real (stolen) refresh secret.
  const ok = await bcryptCompare(secret, session.refresh_token_hash);
  if (!ok) throwApi('REFRESH_TOKEN_INVALID', 401, 'Token de rafraîchissement invalide');

  // Reuse detection (1B): bcrypt PASSED on a session whose revoked_at is set means the token
  // was real and was already rotated. Strong evidence of theft — revoke EVERY active session
  // for this user and force re-authentication.
  if (session.revoked_at) {
    await sb.from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', session.user_id)
      .is('revoked_at', null);
    throwApi('REFRESH_TOKEN_REUSE_DETECTED', 401, 'Sessions révoquées. Reconnecte-toi.');
  }

  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!jwtSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');

  // Atomic rotation (1B): only proceed if THIS session's revoked_at is still null.
  // If a concurrent refresh raced us and revoked it, .select() returns no row — treat as reuse
  // and kill the chain.
  const nowIso = new Date().toISOString();
  const { data: revoked, error: eRev } = await sb.from('sessions')
    .update({ revoked_at: nowIso })
    .eq('id', session.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (eRev) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!revoked) {
    await sb.from('sessions')
      .update({ revoked_at: nowIso })
      .eq('user_id', session.user_id)
      .is('revoked_at', null);
    throwApi('REFRESH_TOKEN_REUSE_DETECTED', 401, 'Sessions révoquées. Reconnecte-toi.');
  }

  // Lock out a suspended/deleted account: a live session must die on its next
  // refresh (≤15 min after suspension, the access-token TTL) — otherwise a
  // banned user keeps working until their refresh token expires days later.
  // admin-set-user-status also deletes sessions for immediate effect; this is
  // the belt-and-suspenders guard.
  const { data: statusRow } = await sb.from('users').select('status').eq('id', session.user_id).maybeSingle();
  if (statusRow && (statusRow as { status?: string }).status !== 'active') {
    await sb.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', session.user_id);
    throwApi('ACCOUNT_SUSPENDED', 403, 'Ce compte a été suspendu. Contacte le support Linky.');
  }

  const { token: access_token } = await signAccessToken(session.user_id, jwtSecret);
  const newSecret = randomRefreshToken();
  const newHash = await bcryptHash(newSecret);
  const expires_at = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: newSess, error: eNew } = await sb.from('sessions').insert({
    user_id: session.user_id,
    refresh_token_hash: newHash,
    user_agent: req.headers.get('user-agent'),
    expires_at,
  }).select('id').single();
  if (eNew || !newSess) throwApi('INTERNAL_ERROR', 500, 'Erreur création session');

  return { body: { access_token, refresh_token: `${newSess.id}.${newSecret}` } };
}, stripTokens));
