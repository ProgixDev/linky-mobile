// Lengopay v1 Payments HTTP client — rewritten 2026-07-07 against the REAL
// production API (verified live with the merchant licence; see
// lengopay-types.ts header for the probe results). The pre-rewrite client was
// built on assumed shapes and had 4 wire bugs: Bearer instead of Basic auth,
// wrong base URL, snake_case field guesses, GET status instead of POST.
//
// Flow: init creates a hosted payment page (payment_url) where the buyer
// picks Orange Money / MTN MoMo and approves; cron-poll-intents polls
// transaction/status until SUCCESS/FAILED, the 15-min TTL sweep cancels
// abandoned links.
//
// v2 added 2026-09-05 (initPaymentV2/getPaymentStatusV2, below): in-app
// Orange Money / MTN, no hosted page — the buyer's number is sent directly
// and Linky's own screens poll for the outcome instead of a WebView. v1
// stays as-is for now (nothing still calls it after this change, but it's
// not deleted — Card/Kulu/Soutra Money would extend the v2 client, not
// resurrect v1).
//
// Env:
//   LINKY_LENGOPAY_BASE_URL     — default https://portal.lengopay.com
//                                 (point at the mock fn base only for tests)
//   LINKY_LENGOPAY_LICENSE_KEY  — raw licence, sent as `Authorization: Basic {key}`
//   LINKY_LENGOPAY_WEBSITE_ID   — merchant site id ('websiteid' on the wire)

import {
  normalizeLengopayStatus,
  type LengopayInitRequest,
  type LengopayInitResponse,
  type LengopayNextStep,
  type LengopayStatusResponse,
  type LengopayV2InitRequest,
  type LengopayV2InitResponse,
  type LengopayV2TypeAccount,
} from '@shared/lengopay-types.ts';

// B (resilience): hard-cap rail HTTP calls. Status should be sub-second; if
// it hangs beyond TIMEOUT_MS we fail fast and classify as RAIL_TRANSIENT.
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseUrl(): string {
  return Deno.env.get('LINKY_LENGOPAY_BASE_URL') || 'https://portal.lengopay.com';
}

function websiteId(): string {
  return Deno.env.get('LINKY_LENGOPAY_WEBSITE_ID') ?? '';
}

function authHeaders(): Record<string, string> {
  const license = Deno.env.get('LINKY_LENGOPAY_LICENSE_KEY') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    // Lengopay's "Basic" is the raw licence key — NOT base64(user:pass).
    'Authorization': `Basic ${license}`,
  };
  // Only needed when BASE_URL points at a Supabase-hosted mock (gateway
  // routing); real Lengopay ignores it.
  if (anon) h['apikey'] = anon;
  return h;
}

export function lengopayConfigured(): boolean {
  return !!Deno.env.get('LINKY_LENGOPAY_LICENSE_KEY') && !!websiteId();
}

// Plafond par transaction signale par le client (25/08 : reunion Lengopay) :
// Orange Money / MTN via Lengopay refuse au-dela de 15 000 000 GNF. Le
// decoupage automatique en plusieurs encaissements est une demande separee,
// non construite ici (cf. message client) — ce garde-fou empeche seulement
// une tentative vouee a l'echec cote Lengopay de partir sans prevenir
// l'acheteur pourquoi.
export const LENGOPAY_MAX_AMOUNT_MINOR = 15_000_000;

export async function initPayment(req: LengopayInitRequest): Promise<LengopayInitResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v1/payments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      websiteid: websiteId(),
      amount: req.amount_minor,
      currency: req.currency,
    }),
  });
  if (!res.ok) throw new Error(`Lengopay init ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: string; pay_id?: string; payment_url?: string; message?: string };
  if (!raw.pay_id || !raw.payment_url) {
    throw new Error(`Lengopay init malformed response: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  return { pay_id: raw.pay_id, payment_url: raw.payment_url, status: 'pending' };
}

export async function getPaymentStatus(payId: string): Promise<LengopayStatusResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v1/transaction/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pay_id: payId, websiteid: websiteId() }),
  });
  if (!res.ok) throw new Error(`Lengopay status ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: unknown; pay_id?: string; message?: string };
  return {
    pay_id: raw.pay_id ?? payId,
    status: normalizeLengopayStatus(raw.status),
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}

/** Hosted payment page for a pay_id — reconstructable client-side too. */
export function paymentUrlFor(payId: string): string {
  return `https://payment.lengopay.com/${payId}`;
}

// ─── v2 — in-app Orange Money / MTN (no hosted page) ────────────────────────
// See lengopay-types.ts header for the full wire shapes retrieved 2026-09-05.

/** Un numero utilisable comme compte Orange Money / MTN guineen. */
export function isGnE164(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && /^\+224\d{9}$/.test(phone);
}

/** +224XXXXXXXXX (what this codebase stores) -> XXXXXXXXX (what v2's `account` wants).
 *  Les appelants doivent avoir filtre avec isGnE164 AVANT (et rendre alors une
 *  erreur comprehensible a l'acheteur) : ce throw-ci n'est qu'un dernier
 *  garde-fou, il produirait un « echec de l'initialisation » opaque. */
export function toLocalGnAccount(e164: string): string {
  const m = /^\+224(\d{9})$/.exec(e164);
  if (!m) throw new Error(`toLocalGnAccount: not a Guinea E.164 number: ${e164}`);
  return m[1];
}

// ─── Table des rails Lengopay Guinee ────────────────────────────────────────
// UNE seule source de verite pour « quelle methode Linky -> quel type_account
// Lengopay, et faut-il un numero ». Elle remplace les quatre ternaires binaires
// (mtn ? lp-momo-gn : lp-om-gn) semes dans place-order, place-orders-batch,
// booking-sign-pay et create-boost : ajouter un rail se faisait a quatre
// endroits, et en oublier un donnait un paiement route vers le mauvais
// operateur — de l'argent au mauvais endroit, pas une erreur d'affichage.
//
// needsAccount : Orange, MTN et Kulu encaissent SUR un numero guineen (envoye
// dans `account`). Soutra Money et la carte n'en veulent pas — l'acheteur
// s'identifie sur la page que Lengopay renvoie.
export type LengopayMethod =
  | 'orange-money' | 'mtn-money' | 'kulu' | 'soutramoney' | 'lengopay-card';

export const LENGOPAY_RAILS: Record<
  LengopayMethod,
  { typeAccount: LengopayV2TypeAccount; needsAccount: boolean; label: string }
> = {
  'orange-money':  { typeAccount: 'lp-om-gn',          needsAccount: true,  label: 'Orange Money' },
  'mtn-money':     { typeAccount: 'lp-momo-gn',        needsAccount: true,  label: 'MTN MoMo' },
  'kulu':          { typeAccount: 'lp-kulu-gn',        needsAccount: true,  label: 'Kulu' },
  'soutramoney':   { typeAccount: 'lp-soutramoney-gn', needsAccount: false, label: 'Soutra Money' },
  'lengopay-card': { typeAccount: 'lp-card-gn',        needsAccount: false, label: 'Carte bancaire' },
};

// Hotes ou une page de paiement Lengopay a le droit de vivre. MIROIR EXACT de
// l'allowlist de app/checkout/pay.tsx, qui refuse de charger toute autre page
// (sans quoi un attaquant pourrait afficher un faux formulaire dans le chrome
// « Paiement » de Linky et hameçonner un code).
//
// La verifier ICI, cote serveur, et pas seulement a l'ecran : une URL que le
// telephone refusera de charger laisse l'acheteur dans une boucle fermee —
// « Lien de paiement introuvable », retour, bouton « Ouvrir la page », refus a
// nouveau, et 15 minutes d'attente pour rien. Vu du serveur, c'est la meme
// chose qu'une absence de page, et ca se traite pareil (voir railNextStep).
const TRUSTED_ACTION_HOST = /^https:\/\/([a-z0-9-]+\.)*(lengopay\.com|soutramoney\.com)(\/|$|\?|#)/i;

export function isLengopayMethod(m: string): m is LengopayMethod {
  return Object.prototype.hasOwnProperty.call(LENGOPAY_RAILS, m);
}

// Ce que la doc annonce pour chaque rail. lp-card-gn n'a AUCUNE section : son
// entree est 'unknown', ce qui veut dire « n'importe quelle forme est
// acceptable, ne crie pas ». Les trois autres sont documentes, donc une forme
// differente de l'attendue est un signal a voir dans les journaux.
const EXPECTED_STEP: Record<LengopayMethod, LengopayNextStep['kind'] | 'unknown'> = {
  'orange-money':  'poll',
  'mtn-money':     'poll',
  'kulu':          'otp',
  'soutramoney':   'webview',
  'lengopay-card': 'unknown',
};

/** Ce que l'acheteur doit encore faire apres l'init. Une etape inattendue est
 *  journalisee, JAMAIS transformee en echec : Lengopay a deja la demande, et
 *  echouer ici annulerait la commande alors que l'acheteur peut encore
 *  confirmer sur son telephone (argent preleve, commande annulee — exactement
 *  ce que l'ordre S2 existe pour eviter). */
export function railNextStep(
  method: LengopayMethod,
  resp: LengopayV2InitResponse,
): LengopayNextStep {
  // Une page sur un hote qu'on ne charge pas equivaut a pas de page du tout :
  // le telephone la refuserait. On la laisse tomber ICI plutot que de la
  // stocker et de renvoyer l'acheteur dans une boucle. Journalise en dur avec
  // l'hote, parce que la seule reparation est de l'ajouter aux deux allowlists
  // une fois qu'on l'a vu passer une fois.
  let webviewUrl = resp.webview_url;
  if (webviewUrl && !TRUSTED_ACTION_HOST.test(webviewUrl)) {
    console.error('[lengopay] v2 init: webview_url sur un hote NON autorise — page ignoree', {
      method, pay_id: resp.pay_id, url: webviewUrl.slice(0, 200),
    });
    webviewUrl = undefined;
  }

  const expected = EXPECTED_STEP[method];

  // UNE PAGE SUR UN RAIL QUI N'EN ATTEND PAS NE DETOURNE PLUS L'ACHETEUR.
  // Sur Orange et MTN, ce qui conclut le paiement est la demande qui arrive sur
  // le telephone. Envoyer quand meme vers une page — et lui afficher « ouvre la
  // page de paiement » au lieu de « valide sur ton telephone » — le detournerait
  // du seul geste qui marche, pour une URL que la WebView pourrait meme refuser.
  // On garde donc l'URL en SECOND RECOURS et on laisse le parcours normal.
  if (webviewUrl && expected === 'poll') {
    console.warn('[lengopay] v2 init: page inattendue sur un rail telephone — gardee en second recours', {
      method, pay_id: resp.pay_id,
    });
    return { kind: 'poll', fallbackUrl: webviewUrl };
  }

  const step: LengopayNextStep = webviewUrl
    ? { kind: 'webview', url: webviewUrl }
    : resp.requires_otp
      ? { kind: 'otp', payId: resp.pay_id }
      : { kind: 'poll' };
  if (expected !== 'unknown' && expected !== step.kind) {
    console.warn('[lengopay] v2 init: etape inattendue', {
      method, pay_id: resp.pay_id, expected, got: step.kind,
    });
  }
  return step;
}

/** L'URL a enregistrer dans payment_intents.rail_action_url, quelle que soit la
 *  forme de l'etape. NULL quand il n'y a aucune page — et jamais l'URL d'une
 *  tentative precedente, puisqu'elle est toujours ecrite dans le meme UPDATE
 *  que le pay_id. */
export function railActionUrl(step: LengopayNextStep): string | null {
  if (step.kind === 'webview') return step.url;
  if (step.kind === 'poll') return step.fallbackUrl ?? null;
  return null;
}

/**
 * L'acheteur se retrouve-t-il SANS AUCUN MOYEN de payer ?
 *
 * Un rail qui n'encaisse pas sur un numero (Soutra Money, carte) ne declenche
 * RIEN cote acheteur : aucune demande sur son telephone, aucun code. Sa seule
 * porte est la page que Lengopay doit renvoyer. Si elle manque — ou si elle
 * pointe sur un hote qu'on ne charge pas — il n'y a plus rien a faire nulle
 * part, et l'ecran d'attente compterait 15 minutes pour rien avant d'annuler.
 *
 * ET ON PEUT FERMER SANS RISQUE, ce qui est l'exception a la regle « ne jamais
 * annuler ce que l'acheteur peut encore payer » : pour que de l'argent bouge il
 * faudrait qu'il ait saisi un code ou un numero de carte QUELQUE PART, et il
 * n'existe justement aucun endroit ou il aurait pu le faire — on n'a envoye
 * aucun `account`, et il n'a recu ni page ni code. Rien n'a pu etre preleve.
 *
 * Les rails a numero (Orange, MTN, Kulu) ne passent JAMAIS par ici : chez eux
 * la demande part sur le telephone, donc l'absence d'etape supplementaire est
 * le comportement normal, et fermer serait exactement la faute qu'on evite.
 */
export function railIsDeadEnd(method: LengopayMethod, step: LengopayNextStep): boolean {
  return !LENGOPAY_RAILS[method].needsAccount && step.kind === 'poll';
}

/** Message unique pour cette impasse — le meme sur les quatre surfaces.
 *  Il ne cite QUE des moyens acceptes PARTOUT ou il peut etre lance : le
 *  portefeuille en faisait partie, mais booking-sign-pay le refuse (payer une
 *  reservation au portefeuille crediterait le sequestre sans contrepartie), donc
 *  un locataire qui suivait le conseil recevait un INVALID_BODY. */
export const RAIL_NO_ACTION_MESSAGE =
  'Ce moyen de paiement est momentanément indisponible. Choisis Orange Money ou MTN.';

/**
 * Duree de vie d'une intention, telle que TOUT le reste du systeme l'applique
 * deja : expire_stale_intents, expire_stale_batch_intents,
 * expire_stale_booking_intents et expire_stale_boost_intents cancellent toutes
 * a `created_at < now() - interval '15 minutes'`, et pick_*_intents_to_poll
 * cessent de sonder au meme age.
 *
 * POURQUOI LES GARDES « UN SEUL PAIEMENT VIVANT » DOIVENT S'Y ALIGNER.
 * Ces balayages refusent d'expirer une intention dont le DERNIER sondage a
 * echoue — clause `(last_polled_at is null or last_error_code is null)`, la
 * meme dans les quatre. C'est deliberé et c'est juste : quand on n'a pas pu
 * joindre le rail, on ne sait pas si l'acheteur a paye, et annuler une commande
 * peut-etre payee serait pire que la laisser trainer.
 *
 * Consequence : une seule erreur passagere de Lengopay sur le dernier sondage
 * de la fenetre laisse l'intention 'pending' POUR TOUJOURS — plus sondee (trop
 * vieille), plus expirable (elle porte une erreur). Une garde sans borne d'age
 * verrait donc eternellement un « paiement en cours » et bloquerait la
 * reservation ou l'annonce a jamais. Avant ces gardes, cette ligne morte etait
 * inoffensive : l'utilisateur ouvrait simplement une nouvelle intention.
 *
 * On ne se montre donc pas plus strict que le reste du systeme : passe ce
 * delai, l'intention est morte pour tout le monde, y compris pour la garde.
 */
export const INTENT_TTL_MS = 15 * 60 * 1000;

/** Vrai tant que l'intention est dans sa fenetre de vie. Voir INTENT_TTL_MS. */
export function intentIsLive(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < INTENT_TTL_MS;
}

export async function initPaymentV2(req: LengopayV2InitRequest): Promise<LengopayV2InitResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v2/payments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      amount: String(req.amount_minor),
      currency: req.currency,
      websiteid: websiteId(),
      type_account: req.type_account,
      // Omis pour Soutra Money / carte : envoyer account:undefined serait
      // serialise en champ absent, mais on l'ecrit explicitement pour que la
      // lecture du corps envoye ne laisse aucun doute.
      ...(req.account ? { account: req.account } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Lengopay v2 init ${res.status}: ${await res.text()}`);
  const raw = await res.json() as {
    success?: boolean; pay_id?: string; message?: string;
    requires_otp?: boolean; webview_url?: string;
    data?: { pay_id?: string; requires_otp?: boolean; webview_url?: string };
  };
  const payId = raw.pay_id ?? raw.data?.pay_id;
  if (!raw.success || !payId) {
    throw new Error(`Lengopay v2 init malformed/failed response: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  // L'etape supplementaire est REMONTEE telle quelle (elle etait jetee avant le
  // 2026-09-07, quand seuls Orange/MTN etaient branches). C'est railNextStep()
  // qui juge si elle est attendue pour ce rail — et qui ne fait que journaliser
  // sinon : on ne transforme jamais une forme inattendue en echec, sans quoi on
  // annulerait une commande que l'acheteur peut encore payer.
  const requiresOtp = (raw.requires_otp ?? raw.data?.requires_otp) === true;
  const rawWebview = raw.webview_url ?? raw.data?.webview_url;
  const webviewUrl = typeof rawWebview === 'string' && rawWebview ? rawWebview : undefined;
  return {
    pay_id: payId,
    ...(requiresOtp ? { requires_otp: true } : {}),
    ...(webviewUrl ? { webview_url: webviewUrl } : {}),
  };
}

/** Kulu : l'acheteur recoit un code par SMS et le saisit dans l'appli.
 *  POST /api/v2/authenticate { pay_id, code }.
 *
 *  NE REND PAS un « paye / pas paye ». La reponse dit seulement si Lengopay a
 *  ACCEPTE le code ; c'est le sondage habituel (getPaymentStatusV2, via le cron)
 *  qui tranche le sort de l'argent, exactement comme pour Orange et MTN. Traiter
 *  un 200 d'ici comme un paiement acquis crediterait le sequestre sur la foi
 *  d'un accuse de reception. */
export async function confirmPaymentV2(
  payId: string,
  code: string,
): Promise<{ accepted: boolean; message: string }> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v2/authenticate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pay_id: payId, code, websiteid: websiteId() }),
  });
  const text = await res.text();
  let raw: { success?: boolean; status?: unknown; message?: string } = {};
  try { raw = JSON.parse(text) as typeof raw; } catch { /* corps non-JSON : traite comme un refus */ }
  const message = typeof raw.message === 'string' ? raw.message : '';
  // Un code faux est une reponse NORMALE du rail, pas une panne : l'acheteur
  // doit pouvoir retaper. On ne jette donc que sur un vrai incident HTTP (5xx),
  // qui lui merite un message different.
  if (res.status >= 500) {
    throw new Error(`Lengopay v2 authenticate ${res.status}: ${text.slice(0, 300)}`);
  }
  const accepted = res.ok && raw.success === true
    && normalizeLengopayStatus(raw.status) !== 'failed';
  return { accepted, message };
}

/** Status body shape assumed identical to v1 ({pay_id, websiteid}) — the v2
 *  doc only mentioned this endpoint in passing, not verified. Safe either
 *  way: normalizeLengopayStatus() defaults anything unrecognized to
 *  'pending', so a wrong assumption here means a slower confirmation (until
 *  the 15-min TTL sweep), never a wrong SUCCESS/FAILED shown to the buyer. */
export async function getPaymentStatusV2(payId: string): Promise<LengopayStatusResponse> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/v2/transaction/status`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pay_id: payId, websiteid: websiteId() }),
  });
  if (!res.ok) throw new Error(`Lengopay v2 status ${res.status}: ${await res.text()}`);
  const raw = await res.json() as { status?: unknown; pay_id?: string; message?: string };
  return {
    pay_id: raw.pay_id ?? payId,
    status: normalizeLengopayStatus(raw.status),
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}
