// Admin — trancher un signalement : 'actioned' (on a agi) ou 'dismissed' (rien
// à faire).
//
// LA SUPPRESSION DU CONTENU RESTE UN GESTE SÉPARÉ (admin-delete-comment,
// admin-delete-review, dépublication de l'annonce). Clore un signalement et
// retirer un contenu sont deux décisions : les lier ferait disparaître le cas le
// plus fréquent en modération, celui du contenu limite qu'on laisse en place
// mais dont on garde la trace.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body {
  report_id: string;
  decision: 'actioned' | 'dismissed';
  note?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DECISIONS = new Set<string>(['actioned', 'dismissed']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.report_id !== 'string' || !UUID_RE.test(x.report_id)) return false;
  if (typeof x.decision !== 'string' || !DECISIONS.has(x.decision)) return false;
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 1000)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/reports/resolve', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  // LE FILTRE SUR status='pending' EST LA GARDE. Deux admins qui tranchent le
  // même signalement au même moment ne peuvent pas écraser la décision de
  // l'autre : le second ne met à jour aucune ligne et reçoit ALREADY_RESOLVED.
  // Même forme que les gardes d'état des fonctions d'argent.
  const { data, error } = await sb
    .from('content_reports')
    .update({
      status: body.decision,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      admin_note: body.note?.trim() || null,
    })
    .eq('id', body.report_id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[admin-resolve-report] update:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  if (!data) {
    // Aucune ligne touchée : soit l'identifiant n'existe pas, soit le
    // signalement était déjà tranché. Les deux méritent un message distinct.
    const { data: exists } = await sb
      .from('content_reports')
      .select('status')
      .eq('id', body.report_id)
      .maybeSingle();
    if (!exists) throwApi('REPORT_NOT_FOUND', 404, 'Signalement introuvable.');
    throwApi('ALREADY_RESOLVED', 409, 'Ce signalement a déjà été traité.');
  }

  return { body: { report_id: body.report_id, status: body.decision } };
}));
