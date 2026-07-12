// Admin — delete an abusive listing comment. The comments FK cascade removes
// its replies (parent_id) and likes (comment_likes) in one shot. Audit row per
// deletion. Before this, comments could only be removed via raw SQL.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { comment_id: string; reason?: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.comment_id !== 'string' || !UUID_RE.test(x.comment_id)) return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/comments/delete', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data: c, error: eC } = await sb
    .from('comments')
    .select('id, body, author_id, listing_kind, listing_id, parent_id')
    .eq('id', body.comment_id)
    .maybeSingle();
  if (eC) { console.error('[admin-delete-comment] lookup:', eC); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!c) throwApi('COMMENT_NOT_FOUND', 404, 'Commentaire introuvable.');

  // Cascade (parent_id + comment_likes both ON DELETE CASCADE) removes replies
  // and likes automatically.
  const { error: dErr } = await sb.from('comments').delete().eq('id', body.comment_id);
  if (dErr) { console.error('[admin-delete-comment] delete:', dErr); throwApi('INTERNAL_ERROR', 500, 'Erreur suppression'); }

  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: 'comment',
    target_id: body.comment_id,
    action: 'comment.delete',
    reason: body.reason?.trim() || null,
    metadata: {
      author_id: (c as { author_id?: string }).author_id ?? null,
      listing_kind: (c as { listing_kind?: string }).listing_kind ?? null,
      listing_id: (c as { listing_id?: string }).listing_id ?? null,
      was_reply: !!(c as { parent_id?: string | null }).parent_id,
      body: String((c as { body?: string }).body ?? '').slice(0, 200),
    },
    before_snapshot: { existed: true },
    after_snapshot: { deleted: true },
  });
  if (auditErr) console.error('[admin-delete-comment] audit insert failed:', auditErr);

  return { body: { ok: true } };
}));
