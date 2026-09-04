// Pre-prod: confirm the OTP from phone-add-request and link the verified phone
// to the caller's account. Mirrors otp-verify's atomic consumption pattern
// (increment_otp_attempts + .is('consumed_at', null) update) so racing two
// verify attempts with the same code can't double-insert the phone.
//
// CRITICAL: the OTP we verify here MUST carry purpose='add_phone' AND user_id
// matching the authenticated caller. Without those two binds a stolen
// signin-purpose code could be used to link arbitrary phones, and a code
// issued for user A could be replayed by user B. Both are account-takeover
// vectors on a phone identity that doubles as a login method.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { matchesOtpCode } from '@shared/phone-code.ts';
import { detectCarrier } from '@shared/validate.ts';

interface Body {
  otp_id: string;
  code: string;
  /** Modification d'un numero : l'ancien est retire APRES que le nouveau soit
   *  pose. Voir le bloc « REMPLACEMENT » plus bas pour l'ordre et pourquoi. */
  replaces_phone_id?: string;
}
function valid(b: unknown): b is Body {
  const x = b as Body;
  if (!x || typeof x.otp_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.otp_id)) return false;
  if (typeof x.code !== 'string' || !/^\d{6}$/.test(x.code)) return false;
  if (x.replaces_phone_id !== undefined
      && (typeof x.replaces_phone_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.replaces_phone_id))) return false;
  return true;
}

const MAX_ATTEMPTS = 5;

Deno.serve(makePost<Body>('/v1/phones/add-confirm', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: otp, error: eOtp } = await sb
    .from('otp_codes')
    .select('id, channel, target, code_hash, purpose, attempts, expires_at, consumed_at, user_id')
    .eq('id', body.otp_id)
    .maybeSingle();
  if (eOtp) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!otp) throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  if (otp.purpose !== 'add_phone' || otp.channel !== 'phone') {
    // Wrong-purpose / wrong-channel OTPs from another flow must not link a
    // phone. Treat as a generic "not found" so we don't surface internal
    // purpose names to the caller.
    throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  }
  if (otp.user_id !== userId) {
    // The code was issued for a different session — refuse without leaking
    // identity. Two callers asking for an OTP on the same number get two
    // codes ; this hardens against the "I made you ask, now I verify" replay.
    throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  }
  if (otp.consumed_at) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');
  if (new Date(otp.expires_at).getTime() <= Date.now()) throwApi('OTP_EXPIRED', 410, 'Code expiré');
  if (otp.attempts >= MAX_ATTEMPTS) throwApi('OTP_TOO_MANY_ATTEMPTS', 429, 'Trop de tentatives');

  const hmacSecret = Deno.env.get('LINKY_OTP_HMAC_SECRET');
  if (!hmacSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  // Local HMAC compare, or a round-trip to Prelude when it generated the code.
  const ok = await matchesOtpCode({ storedHash: otp.code_hash, target: otp.target, code: body.code, hmacSecret });
  if (!ok) {
    await sb.rpc('increment_otp_attempts', { p_otp_id: otp.id });
    throwApi('OTP_INVALID', 401, 'Code incorrect');
  }

  // Atomic consumption — second concurrent verify finds no row and bails.
  const { data: consumed, error: eCons } = await sb
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otp.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (eCons) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!consumed) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');

  // ── REMPLACEMENT (client 2026-09-03 : « pouvoir modifier son numero ») ────
  // On ne met JAMAIS a jour phones.e164 en place. Un numero est un moyen de
  // connexion (find_or_create_user_with_phone et phone-signin resolvent le
  // compte par e164) : une modification directe permettrait a une session
  // volee de rediriger l'identite de connexion vers le numero de l'attaquant,
  // sans jamais prouver qu'il le possede. Ici la possession du NOUVEAU numero
  // est deja prouvee — l'OTP vient d'etre valide juste au-dessus.
  //
  // ORDRE VOLONTAIRE : inserer le nouveau, PUIS supprimer l'ancien, PUIS
  // promouvoir. A aucun instant le compte ne se retrouve sans numero, donc un
  // echec au milieu ne peut pas enfermer l'utilisateur dehors. L'inverse
  // (supprimer d'abord) laisserait une fenetre ou un echec d'insertion vide le
  // compte de tout moyen de connexion.
  let replacing: { id: string; is_primary: boolean } | null = null;
  if (body.replaces_phone_id) {
    const { data: oldRow, error: eOld } = await sb
      .from('phones')
      .select('id, user_id, is_primary')
      .eq('id', body.replaces_phone_id)
      .maybeSingle();
    if (eOld) {
      console.error('[phone-add-confirm] replace lookup error:', eOld);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    if (!oldRow || oldRow.user_id !== userId) {
      throwApi('PHONE_NOT_FOUND', 404, 'Numéro à remplacer introuvable');
    }
    replacing = { id: oldRow.id, is_primary: oldRow.is_primary };
  }

  // Client 2026-07-22: the FIRST phone a user links becomes primary automatically
  // (a lone number is de facto the default — mobile-money payouts need one set).
  // Later adds stay non-primary ; switching primary remains an explicit action.
  // Sur un remplacement on insere TOUJOURS en non-principal : l'ancien porte
  // encore le drapeau a cet instant (index unique un-seul-principal), la
  // promotion se fait apres sa suppression.
  const { count: existingPhones } = await sb
    .from('phones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const makePrimary = !replacing && (existingPhones ?? 0) === 0;

  // Final insert. The e164 UNIQUE constraint is the last line of defense:
  // even if two confirms race past the add-request "already linked" check
  // with different codes for the same number, only one can win.
  const { data: row, error: eIns } = await sb
    .from('phones')
    .insert({
      user_id: userId,
      e164: otp.target,
      carrier: detectCarrier(otp.target),
      is_primary: makePrimary, // first phone auto-primary (client 2026-07-22)
      verified_at: new Date().toISOString(),
    })
    .select('id, e164, carrier, is_primary, verified_at, created_at')
    .single();
  if (eIns || !row) {
    if ((eIns as { code?: string } | null)?.code === '23505') {
      throwApi('PHONE_ALREADY_LINKED', 409, 'Ce numéro est déjà utilisé.');
    }
    console.error('[phone-add-confirm] insert error:', eIns);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // Le nouveau numero est en place et verifie : on peut retirer l'ancien.
  // Au-dela d'ici, plus rien ne doit faire echouer la requete — le
  // remplacement a deja reussi du point de vue de l'utilisateur, et rendre une
  // erreur lui ferait croire le contraire alors que son nouveau numero est
  // bien enregistre. Les echecs restants sont journalises en CRITICAL.
  let isPrimary = row.is_primary;
  if (replacing) {
    const { error: eDel } = await sb
      .from('phones')
      .delete()
      .eq('id', replacing.id)
      .eq('user_id', userId);
    if (eDel) {
      console.error('[phone-add-confirm] CRITICAL old phone not removed after replace', {
        userId, old: replacing.id, added: row.id, eDel,
      });
    } else if (replacing.is_primary) {
      const { error: ePromote } = await sb
        .from('phones')
        .update({ is_primary: true })
        .eq('id', row.id)
        .eq('user_id', userId);
      if (ePromote) {
        console.error('[phone-add-confirm] CRITICAL primary not carried over after replace', {
          userId, added: row.id, ePromote,
        });
      } else {
        isPrimary = true;
      }
    }
  }

  return {
    body: {
      phone: {
        id: row.id,
        e164: row.e164,
        carrier: row.carrier,
        is_primary: isPrimary,
        verified: row.verified_at !== null,
        created_at: row.created_at,
      },
      replaced_phone_id: replacing?.id ?? null,
    },
  };
}));
