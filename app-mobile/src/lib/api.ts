// Thin fetch wrapper for Linky edge functions.
// - Injects apikey + Bearer access token (when present)
// - Generates an Idempotency-Key per POST
// - On 401 with an access token, attempts a silent refresh, then retries once
// - Returns the parsed JSON body (or throws ApiError on non-2xx)

import { secure, SECURE_KEYS } from './storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !ANON_KEY) {
  // Will surface during dev as a clear error rather than a confusing fetch failure.
  console.warn('[api] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing');
}

const FN_BASE = `${SUPABASE_URL ?? ''}/functions/v1`;

export interface ApiErrorBody {
  code: string;
  message_fr: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  message_fr: string;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message_fr || body.code);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.message_fr = body.message_fr;
    // Hermes/Babel subclass-of-Error footgun: in some transpilation paths the
    // prototype chain is dropped, so instance properties set after super() can
    // disappear. Re-pin the prototype defensively.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Server may return either { error: { code, message_fr } } or a flat
// { code, message_fr } depending on layer. Try both before falling back.
function parseErrorBody(raw: string): ApiErrorBody | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { error?: ApiErrorBody; code?: string; message_fr?: string };
    if (j?.error?.code) return j.error;
    if (j?.code) return { code: j.code, message_fr: j.message_fr ?? '' };
    return null;
  } catch {
    return null;
  }
}

// Pulls a user-facing French message out of anything thrown by apiPost.
// Useful in screen catch blocks where the thrown value's runtime shape may
// vary (ApiError instance, plain object, TypeError from fetch failure, etc).
/** Messages SERVEUR qui n'ont rien a faire sous les yeux d'un utilisateur.
 *  Ils decrivent notre plomberie, pas ce qu'il peut faire. */
const TECHNIQUES = new Set([
  'Erreur base de donnees', 'Erreur base de données',
  'Configuration manquante',
  'Session invalide ou expiree.', 'Session invalide ou expirée.',
  'Erreur reseau', 'Erreur réseau',
  'Erreur de rafraichissement', 'Erreur de rafraîchissement',
]);

export function toToastMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    // Coupure reseau : de loin la cause la plus frequente sur une connexion
    // mobile guineenne. Dire QUOI FAIRE, pas seulement que ca a echoue.
    if (e.status === 0 || e.code === 'NETWORK_ERROR') {
      return 'Connexion interrompue. Verifie ton reseau et reessaie.';
    }
    // Session : l'app deconnecte et ramene a l'accueil (voir setOnSessionLost),
    // le message accompagne ce mouvement au lieu de le subir.
    if (e.status === 401) {
      return 'Ta session a expire. Reconnecte-toi pour continuer.';
    }
    // Panne de notre cote : l'utilisateur n'y peut rien, et « erreur base de
    // donnees » ne lui apprend rien d'utile.
    if (e.status >= 500 && TECHNIQUES.has(e.message_fr)) {
      return "Un probleme de notre cote. Reessaie dans un instant.";
    }
    if (TECHNIQUES.has(e.message_fr)) return fallback;
    return e.message_fr || fallback;
  }
  if (e && typeof e === 'object') {
    const o = e as { message_fr?: unknown; message?: unknown };
    if (typeof o.message_fr === 'string' && o.message_fr) return o.message_fr;
    if (typeof o.message === 'string' && o.message) return o.message;
  }
  return fallback;
}

function uuid(): string {
  // RFC 4122 v4 via Math.random. Hermes here doesn't expose globalThis.crypto,
  // and idempotency keys don't need cryptographic randomness — just uniqueness.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Appelee UNIQUEMENT quand le serveur declare le jeton de rafraichissement
 *  mort. Enregistree par app/_layout.tsx, qui deconnecte proprement et ramene
 *  a l'ecran de connexion. Un rappel plutot qu'un import direct du magasin :
 *  data/queries/auth importe deja ce module, l'import inverse creerait un
 *  cycle. */
let onSessionLost: (() => void) | null = null;
export function setOnSessionLost(cb: (() => void) | null): void {
  onSessionLost = cb;
}

interface RefreshResponse { access_token: string; refresh_token: string }

async function callRefresh(refreshToken: string): Promise<RefreshResponse> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/session-refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON_KEY ?? '',
        authorization: `Bearer ${ANON_KEY ?? ''}`,
        'idempotency-key': uuid(),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch (e) {
    console.error('[api] network error (session-refresh):', e);
    throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error('[api] session-refresh non-2xx', res.status, raw);
    const parsed = parseErrorBody(raw);
    throw new ApiError(res.status, parsed ?? { code: 'REFRESH_FAILED', message_fr: 'Erreur de rafraîchissement' });
  }
  return (await res.json()) as RefreshResponse;
}

// Decode a JWT's `exp` (seconds since epoch) without a library. Hermes lacks a
// reliable atob, so base64url is decoded by hand. Returns null on any parse
// failure — the caller treats null as "unknown → don't proactively refresh".
// Only `exp` (an ASCII number) is read, so the Latin-1 byte decode is safe for
// our self-rolled payload ({ sub, iat, exp, role }).
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function jwtExp(token: string): number | null {
  try {
    const seg = token.split('.')[1];
    if (!seg) return null;
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    let bits = 0, val = 0, out = '';
    for (const ch of b64) {
      const idx = B64_ALPHABET.indexOf(ch);
      if (idx === -1) continue;
      val = (val << 6) | idx;
      bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((val >> bits) & 0xff); }
    }
    const claims = JSON.parse(out) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

// Rafraichissement serialise.
//
// BUG CORRIGE (client 2026-08-11, « ce probleme il y a partout et j'ai une
// connexion normale ») : le jeton etait lu par CHAQUE appelant AVANT d'entrer
// dans le verrou. Un ecran lance 3 ou 4 requetes a la fois ; toutes lisaient le
// meme jeton R1, la premiere le consommait, et le serveur le revoquait en
// emettant R2. Une requete un peu en retard presentait alors R1 a nouveau — le
// serveur y voit un jeton REJOUE, signal de vol, et revoque TOUTES les sessions
// du compte (session-refresh, detection de reutilisation). D'ou des
// deconnexions permanentes sur une connexion parfaite, et 97 sessions
// accumulees sur le compte de test.
//
// Trois garde-fous :
//   1. Le jeton est lu A L'INTERIEUR du verrou, donc au moment de l'envoi.
//   2. Les nouveaux jetons sont ecrits DANS le verrou : tous ceux qui attendent
//      voient le meme etat, personne ne repart sur l'ancien.
//   3. Un rafraichissement tout juste termine n'est pas refait — les 401 qui
//      arrivent juste apres rejouent simplement avec le nouveau jeton d'acces.
let refreshInFlight: Promise<RefreshResponse> | null = null;
let lastRefreshAt = 0;
const REFRESH_COOLDOWN_MS = 10_000;

async function refreshOnce(): Promise<RefreshResponse | null> {
  // Un rafraichissement vient d'aboutir : le jeton d'acces en stockage est deja
  // neuf. Relancer une rotation ne ferait qu'inviter la detection de rejeu.
  if (!refreshInFlight && Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) {
    return null;
  }
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const token = await secure.get(SECURE_KEYS.refreshToken);
      if (!token) {
        throw new ApiError(401, { code: 'NO_REFRESH_TOKEN', message_fr: 'Session expiree' });
      }
      const next = await callRefresh(token);
      await secure.set(SECURE_KEYS.authToken, next.access_token);
      await secure.set(SECURE_KEYS.refreshToken, next.refresh_token);
      lastRefreshAt = Date.now();
      return next;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface ApiCallOptions {
  path: string;          // e.g. '/otp-request'
  body?: unknown;
  authed?: boolean;      // include user Bearer token; default true except for auth endpoints
  idempotencyKey?: string;
}

export async function apiPost<T>({ path, body, authed = true, idempotencyKey }: ApiCallOptions): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new ApiError(0, { code: 'CONFIG_MISSING', message_fr: 'Configuration manquante' });

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const access = authed ? await secure.get(SECURE_KEYS.authToken) : null;
    const bearer = access ?? ANON_KEY;
    return {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${bearer}`,
      'idempotency-key': idempotencyKey ?? uuid(),
    };
  };

  const send = async (headers: Record<string, string>): Promise<Response> => {
    try {
      return await fetch(`${FN_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      });
    } catch (e) {
      console.error(`[api] network error (POST ${path}):`, e);
      throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
    }
  };

  // Proactive refresh: an access token lives only 15 min. Optional-auth reads
  // (list-comments and other public-but-personalized endpoints) return 200 even
  // with an EXPIRED token — the server just treats the caller as anonymous — so
  // the reactive 401 path below never fires and the app can sit on a stale token
  // (symptom: comment hearts show empty after 15 min away, and a tap removes the
  // real like). If the stored token is already expired and a refresh token
  // exists, refresh BEFORE the call. refreshOnce is single-flight; on failure we
  // fall through (the 401 path / anonymous read remains the backstop).
  if (authed) {
    const stored = await secure.get(SECURE_KEYS.authToken);
    const exp = stored ? jwtExp(stored) : null;
    if (exp !== null && exp * 1000 <= Date.now() + 30_000) {
      try {
        // Meme course que sur le chemin 401, et celui-ci s'execute avant CHAQUE
        // requete : c'est probablement lui qui declenchait le rejeu. Le jeton
        // est lu et enregistre dans le verrou.
        await refreshOnce();
      } catch {
        /* fall through — reactive 401 refresh below is the backstop */
      }
    }
  }

  let headers = await buildHeaders();
  let res = await send(headers);

  // 401 path: try a silent refresh once, then retry the original call with the new access token.
  if (res.status === 401 && authed) {
    {
      try {
        // refreshOnce lit le jeton et enregistre les nouveaux LUI-MEME : aucun
        // jeton n'est capture ici, sinon la course revient.
        await refreshOnce();
        headers = await buildHeaders();
        res = await send(headers);
      } catch (e) {
        // DEUX echecs tres differents etaient traites pareil (client 2026-08-11,
        // « Session invalide ou expiree » en pleine utilisation) :
        //
        // 1. Le serveur REFUSE le jeton (401/403) : la session est reellement
        //    morte, il faut deconnecter — et le DIRE, au lieu de laisser une
        //    session fantome ou l'ecran parait connecte mais chaque action
        //    echoue.
        // 2. Le reseau a laché (status 0) : la session est PARFAITEMENT VALIDE.
        //    L'ancien code effacait quand meme les jetons, donc une coupure de
        //    3G suffisait a deconnecter definitivement — et chaque reconnexion
        //    coute un SMS. Sur le marche vise, c'est quotidien.
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 401 || status === 403) {
          await secure.remove(SECURE_KEYS.authToken);
          await secure.remove(SECURE_KEYS.refreshToken);
          onSessionLost?.();
        }
        // Coupure reseau : on garde les jetons. Le prochain appel reessaiera.
      }
    }

    // Le rejeu a AUSSI renvoye 401 : le rafraichissement a beau avoir « reussi »
    // (ou avoir ete saute par la temporisation), le serveur refuse toujours ce
    // compte. Sans ce garde-fou on retombait dans la session fantome que la
    // correction precedente etait censee fermer : l'ecran restait connecte et
    // chaque action echouait en silence.
    if (res.status === 401) {
      await secure.remove(SECURE_KEYS.authToken);
      await secure.remove(SECURE_KEYS.refreshToken);
      onSessionLost?.();
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error(`[api] POST ${path} non-2xx`, res.status, raw);
    const parsed = parseErrorBody(raw);
    throw new ApiError(res.status, parsed ?? { code: 'UNKNOWN', message_fr: 'Erreur réseau' });
  }
  return (await res.json()) as T;
}
