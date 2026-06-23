// Phase LIVREUR ONBOARDING — admin review queue. Admin-only
// (requireUser + assertAdmin, live is_admin re-check, Phase K posture).
//
// Body : { status?: 'pending'|'approved'|'rejected', limit?, cursor? }
//        (default 'pending'). Keyset pagination on (created_at desc, id desc).
// Response : { applications: [...camelCase rows with the user's primary
//        phone + email joined for contact...], next_cursor }
//
// Contact info (phone/email) lives in side tables (phones / emails, one
// primary each), so we fetch the applications first, then batch-load the
// primary phone + email for the page's user_ids and stitch — avoids brittle
// nested PostgREST embeds with per-embed filters.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const STATUSES = new Set(['pending', 'approved', 'rejected']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

interface Cursor { created_at: string; id: string }
interface Body {
  status?: 'pending' | 'approved' | 'rejected';
  limit?: number;
  cursor?: Cursor;
}

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status as string))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

interface AppRow {
  id: string;
  user_id: string;
  full_name: string;
  city: string;
  vehicle_type: string;
  id_photo_url: string | null;
  answers: Record<string, unknown>;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

Deno.serve(makePost<Body>('/v1/admin/livreur/applications/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const status = body.status ?? 'pending';
  const limit = body.limit ?? 50;

  let q = sb
    .from('livreur_applications')
    .select('id, user_id, full_name, city, vehicle_type, id_photo_url, answers, status, reject_reason, created_at')
    .eq('status', status);

  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[admin-list-livreur-applications] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as AppRow[] | null) ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  // Batch-load the primary phone + email for the page (one query each).
  const phoneByUser = new Map<string, string>();
  const emailByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const [{ data: phones }, { data: emails }] = await Promise.all([
      sb.from('phones').select('user_id, e164, is_primary').in('user_id', userIds),
      sb.from('emails').select('user_id, address, is_primary').in('user_id', userIds),
    ]);
    // Prefer the primary; fall back to the first row seen for that user.
    for (const p of (phones as { user_id: string; e164: string; is_primary: boolean }[] | null) ?? []) {
      if (p.is_primary || !phoneByUser.has(p.user_id)) phoneByUser.set(p.user_id, p.e164);
    }
    for (const e of (emails as { user_id: string; address: string; is_primary: boolean }[] | null) ?? []) {
      if (e.is_primary || !emailByUser.has(e.user_id)) emailByUser.set(e.user_id, e.address);
    }
  }

  const applications = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    phone: phoneByUser.get(r.user_id) ?? null,
    email: emailByUser.get(r.user_id) ?? null,
    city: r.city,
    vehicleType: r.vehicle_type,
    idPhotoUrl: r.id_photo_url,
    answers: r.answers,
    status: r.status,
    rejectReason: r.reject_reason ?? undefined,
    createdAt: r.created_at,
  }));

  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;

  return { body: { applications, next_cursor } };
}));
