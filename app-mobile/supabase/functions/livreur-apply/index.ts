// Phase LIVREUR ONBOARDING — courier submits an application. Authed
// (requireUser → applicant; the body never names a user, so a caller can only
// ever apply as themselves).
//
// Upsert-on-user semantics (one application per user, unique user_id):
//   - already has the 'livreur' role            → 409 ALREADY_LIVREUR
//   - existing application status 'approved'    → 409 ALREADY_LIVREUR
//   - existing application status 'pending'     → 409 APPLICATION_PENDING
//   - none OR 'rejected'                         → (re)create at 'pending'
//
// accepts_qr_process + accepts_linky_terms MUST both be true (the inverted-QR
// handoff + Linky terms are non-negotiable for a courier) → else
// 400 MUST_ACCEPT_TERMS.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

const VEHICLES = new Set(['moto', 'voiture', 'velo', 'a_pied']);

interface Answers {
  zones: string | string[];
  availability: string;
  has_license_insurance: boolean;
  accepts_qr_process: boolean;
  accepts_linky_terms: boolean;
}

interface Body {
  full_name: string;
  city: string;
  vehicle_type: 'moto' | 'voiture' | 'velo' | 'a_pied';
  id_photo_url?: string;
  answers: Answers;
}

function validAnswers(a: unknown): a is Answers {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  const zonesOk =
    (typeof x.zones === 'string' && x.zones.length <= 500) ||
    (Array.isArray(x.zones) && x.zones.length <= 30 && x.zones.every((z) => typeof z === 'string' && z.length <= 80));
  if (!zonesOk) return false;
  if (typeof x.availability !== 'string' || x.availability.length > 500) return false;
  if (typeof x.has_license_insurance !== 'boolean') return false;
  if (typeof x.accepts_qr_process !== 'boolean') return false;
  if (typeof x.accepts_linky_terms !== 'boolean') return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.full_name !== 'string' || x.full_name.trim().length < 1 || x.full_name.length > 120) return false;
  if (typeof x.city !== 'string' || x.city.trim().length < 1 || x.city.length > 80) return false;
  if (typeof x.vehicle_type !== 'string' || !VEHICLES.has(x.vehicle_type)) return false;
  if (x.id_photo_url !== undefined && (typeof x.id_photo_url !== 'string' || x.id_photo_url.length > 2048)) return false;
  if (!validAnswers(x.answers)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/livreur/apply', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Hard gates on the terms BEFORE touching the DB — these never change with
  // application state.
  if (body.answers.accepts_qr_process !== true || body.answers.accepts_linky_terms !== true) {
    throwApi('MUST_ACCEPT_TERMS', 400, 'Tu dois accepter le processus QR et les conditions Linky.');
  }

  // Already a livreur by role → nothing to apply for (covers role granted
  // outside an application row, e.g. via update-profile).
  const { data: user, error: userErr } = await sb
    .from('users')
    .select('roles')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) {
    console.error('[livreur-apply] user read error:', userErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (user && Array.isArray(user.roles) && (user.roles as string[]).includes('livreur')) {
    throwApi('ALREADY_LIVREUR', 409, 'Tu es déjà livreur.');
  }

  // Existing application state gate.
  const { data: existing, error: exErr } = await sb
    .from('livreur_applications')
    .select('id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (exErr) {
    console.error('[livreur-apply] existing read error:', exErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (existing?.status === 'pending') {
    throwApi('APPLICATION_PENDING', 409, "Ta candidature est déjà en cours d'examen.");
  }
  if (existing?.status === 'approved') {
    throwApi('ALREADY_LIVREUR', 409, 'Tu es déjà livreur.');
  }

  // none or 'rejected' → (re)create at pending, clearing any prior decision.
  const now = new Date().toISOString();
  const { data: application, error: upErr } = await sb
    .from('livreur_applications')
    .upsert(
      {
        user_id: userId,
        full_name: body.full_name.trim(),
        city: body.city.trim(),
        vehicle_type: body.vehicle_type,
        id_photo_url: body.id_photo_url ?? null,
        answers: body.answers,
        status: 'pending',
        reject_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )
    .select('id, user_id, full_name, city, vehicle_type, id_photo_url, answers, status, reject_reason, reviewed_by, reviewed_at, created_at, updated_at')
    .single();
  if (upErr || !application) {
    console.error('[livreur-apply] upsert error:', upErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement candidature');
  }

  return { body: { application } };
}));
