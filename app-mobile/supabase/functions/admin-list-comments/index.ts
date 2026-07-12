// Admin — recent listing comments across the whole marketplace, newest first,
// for the moderation feed. Author name + listing title joined via batched Maps
// (project convention). Read-only; the delete action is admin-delete-comment.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { limit?: number }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

interface Row {
  id: string; body: string; created_at: string; author_id: string;
  listing_kind: 'product' | 'property'; listing_id: string; parent_id: string | null;
}

Deno.serve(makePost<Body>('/v1/admin/comments/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data, error } = await sb
    .from('comments')
    .select('id, body, created_at, author_id, listing_kind, listing_id, parent_id')
    .order('created_at', { ascending: false })
    .limit(body.limit ?? 100);
  if (error) { console.error('[admin-list-comments] query:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const rows = (data as Row[] | null) ?? [];

  // Author names (batched).
  const authors = new Map<string, string | null>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.author_id))];
    const { data: us } = await sb.from('users').select('id, display_name').in('id', ids);
    for (const u of (us as { id: string; display_name: string | null }[] | null) ?? []) authors.set(u.id, u.display_name);
  }
  // Listing titles (batched per kind).
  const titles = new Map<string, string>();
  const prodIds = [...new Set(rows.filter((r) => r.listing_kind === 'product').map((r) => r.listing_id))];
  const propIds = [...new Set(rows.filter((r) => r.listing_kind === 'property').map((r) => r.listing_id))];
  if (prodIds.length) {
    const { data: p } = await sb.from('products').select('id, title').in('id', prodIds);
    for (const x of (p as { id: string; title: string }[] | null) ?? []) titles.set(`product:${x.id}`, x.title);
  }
  if (propIds.length) {
    const { data: p } = await sb.from('properties').select('id, title').in('id', propIds);
    for (const x of (p as { id: string; title: string }[] | null) ?? []) titles.set(`property:${x.id}`, x.title);
  }

  const comments = rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorName: authors.get(r.author_id) ?? null,
    listingKind: r.listing_kind,
    listingId: r.listing_id,
    listingTitle: titles.get(`${r.listing_kind}:${r.listing_id}`) ?? null,
    isReply: !!r.parent_id,
  }));

  return { body: { comments } };
}));
