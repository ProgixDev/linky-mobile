// Connexion par TELEPHONE + mot de passe (client 2026-08-17).
//
// Jumelle de email-signin, qui ne cherchait que dans la table des emails : un
// compte cree par telephone ne pouvait donc se connecter que par code, et
// payait un SMS a chaque session. Meme porte, autre serrure.
//
// Ce fichier est un DECALQUE volontaire de email-signin. Toute protection y est
// reproduite a l'identique, et pour les memes raisons :
//   * limitation par destinataire ET par adresse IP, AVANT le calcul bcrypt,
//     pour ne pas offrir 100 ms de calcul a chaque tentative bloquee ;
//   * bcryptCompare execute meme quand le compte n'existe pas, contre une
//     empreinte factice — sans quoi le temps de reponse revelerait quels
//     numeros sont inscrits ;
//   * requete en base sur les deux branches (numero valide ou non), pour que
//     « format invalide » et « inconnu » soient indistinguables ;
//   * message d'erreur unique : mauvais numero, mauvais mot de passe, compte
//     sans mot de passe et compte suspendu renvoient tous la meme phrase.
//
// Si tu modifies l'un des deux fichiers, regarde l'autre.
import { makePost, stripTokens } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { normalizePhone } from '@shared/validate.ts';
import { signAccessToken, randomRefreshToken } from '@shared/jwt.ts';
import { bcryptHash, bcryptCompare } from '@shared/bcrypt.ts';

interface Body { phone: string; password: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.phone === 'string' && typeof x.password === 'string' && x.password.length > 0;
}

const REFRESH_TTL_DAYS = 90;

// Empreinte bcrypt(10) pre-calculee, comparee quand le numero n'existe pas pour
// que le temps de reponse reste constant. Sa publication ne donne rien a
// personne : elle ne correspond a aucun compte.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const SIGNIN_FAIL_LIMIT_PER_PHONE = 5;
const SIGNIN_FAIL_WINDOW_MIN = 15;
const SIGNIN_FAIL_LIMIT_PER_IP = 20;
const SIGNIN_IP_WINDOW_MIN = 60;

function getClientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (!fwd) return null;
  const first = fwd.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

Deno.serve(makePost<Body>('/v1/auth/phone/signin', valid, async ({ sb, body, req }) => {
  const normalized = normalizePhone(body.phone);
  // Cle de limitation : le numero normalise s'il est valide, sinon la saisie
  // brute tronquee. Le chemin bcrypt s'execute de toute facon plus bas, donc le
  // temps de reponse reste constant meme pour un format invalide.
  const target = normalized ?? body.phone.trim().slice(0, 32);
  const ip = getClientIp(req);
  const now = Date.now();

  // Limitation AVANT bcrypt — une tentative bloquee ne doit rien coûter.
  const phoneWindowAgo = new Date(now - SIGNIN_FAIL_WINDOW_MIN * 60_000).toISOString();
  const { count: phoneFailCount } = await sb
    .from('signin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('target', target)
    .eq('succeeded', false)
    .gte('created_at', phoneWindowAgo);
  if ((phoneFailCount ?? 0) >= SIGNIN_FAIL_LIMIT_PER_PHONE) {
    throwApi('SIGNIN_RATE_LIMITED', 429, 'Trop de tentatives. Réessaie dans quelques minutes.');
  }

  if (ip) {
    const ipWindowAgo = new Date(now - SIGNIN_IP_WINDOW_MIN * 60_000).toISOString();
    const { count: ipFailCount } = await sb
      .from('signin_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('succeeded', false)
      .gte('created_at', ipWindowAgo);
    if ((ipFailCount ?? 0) >= SIGNIN_FAIL_LIMIT_PER_IP) {
      throwApi('SIGNIN_RATE_LIMITED', 429, 'Trop de tentatives. Réessaie plus tard.');
    }
  }

  // Sentinelle impossible a porter par un vrai numero : la requete part sur les
  // deux branches, donc « format invalide » et « numero inconnu » ont la meme
  // forme et la meme duree.
  const lookupPhone = normalized ?? '\x00invalid\x00';
  const { data: row, error: eRow } = await sb
    .from('phones')
    .select('user_id, users:users(id, display_name, avatar_url, locale, kyc_status, city, roles, password_hash, status, is_admin)')
    .eq('e164', lookupPhone)
    .maybeSingle();
  if (eRow) {
    console.error('[phone-signin] phones select error:', eRow);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const user = (row?.users ?? null) as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    locale: string;
    kyc_status: string;
    city: string | null;
    roles: string[];
    password_hash: string | null;
    status: string;
    is_admin: boolean;
  } | null;

  // Toujours comparer : vraie empreinte si le compte existe, factice sinon.
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const bcryptOk = await bcryptCompare(body.password, hashToCheck);

  const ok =
    !!user &&
    !!user.password_hash &&
    user.status === 'active' &&
    bcryptOk;

  // Chaque tentative est journalisee, reussie ou non : c'est ce que lit le
  // limiteur ci-dessus.
  await sb.from('signin_attempts').insert({ target, ip, succeeded: ok });

  if (!ok) throwApi('AUTH_INVALID_CREDENTIALS', 401, 'Identifiants invalides');

  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!jwtSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  const { token: access_token } = await signAccessToken(user!.id, jwtSecret);
  const refreshSecret = randomRefreshToken();
  const refresh_hash = await bcryptHash(refreshSecret);
  const expires_at = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: sess, error: eSess } = await sb.from('sessions').insert({
    user_id: user!.id,
    refresh_token_hash: refresh_hash,
    user_agent: req.headers.get('user-agent'),
    expires_at,
  }).select('id').single();
  if (eSess || !sess) throwApi('INTERNAL_ERROR', 500, 'Erreur création session');

  const { password_hash: _ph, status: _st, ...userOut } = user!;
  return { body: { access_token, refresh_token: `${sess.id}.${refreshSecret}`, user: userOut } };
}, stripTokens));
