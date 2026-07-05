// Add a comment to a product or property listing. Authed. Verifies the listing
// exists (and finds its owner for the notification), inserts the comment, pings
// the owner (best-effort), and returns the created comment enriched with the
// author's name + avatar so the client can prepend it optimistically.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  listing_kind: 'product' | 'property';
  listing_id: string;
  body: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const KINDS = new Set(['product', 'property']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.listing_kind !== 'string' || !KINDS.has(x.listing_kind)) return false;
  if (typeof x.listing_id !== 'string' || !UUID_RE.test(x.listing_id)) return false;
  if (typeof x.body !== 'string') return false;
  const t = x.body.trim();
  if (t.length < 1 || t.length > 1000) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/comments/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const text = body.body.trim();

  // Light anti-spam: at most one comment per author per listing per 20s. Bounds
  // rapid-fire flooding + owner-notification spam without a full rate-limiter.
  const since = new Date(Date.now() - 20_000).toISOString();
  const { data: recent } = await sb
    .from('comments')
    .select('id')
    .eq('listing_kind', body.listing_kind)
    .eq('listing_id', body.listing_id)
    .eq('author_id', userId)
    .gte('created_at', since)
    .limit(1);
  if (recent && recent.length > 0) {
    throwApi('COMMENT_TOO_FAST', 429, 'Tu commentes trop vite — patiente quelques secondes.');
  }

  // Verify the listing exists + find its owner (for the notification).
  let ownerId: string | null = null;
  let title = '';
  if (body.listing_kind === 'product') {
    const { data: p, error } = await sb
      .from('products').select('id, title, shop_id').eq('id', body.listing_id).maybeSingle();
    if (error) { console.error('[post-comment] product lookup:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    if (!p) throwApi('LISTING_NOT_FOUND', 404, 'Annonce introuvable.');
    title = ((p as { title?: string }).title) ?? '';
    const shopId = (p as { shop_id?: string }).shop_id;
    if (shopId) {
      const { data: shop } = await sb.from('shops').select('owner_id').eq('id', shopId).maybeSingle();
      ownerId = ((shop as { owner_id?: string } | null)?.owner_id) ?? null;
    }
  } else {
    const { data: pr, error } = await sb
      .from('properties').select('id, title, owner_id').eq('id', body.listing_id).maybeSingle();
    if (error) { console.error('[post-comment] property lookup:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    if (!pr) throwApi('LISTING_NOT_FOUND', 404, 'Annonce introuvable.');
    title = ((pr as { title?: string }).title) ?? '';
    ownerId = ((pr as { owner_id?: string }).owner_id) ?? null;
  }

  const { data: inserted, error: iErr } = await sb
    .from('comments')
    .insert({ listing_kind: body.listing_kind, listing_id: body.listing_id, author_id: userId, body: text })
    .select('id, body, created_at')
    .single();
  if (iErr || !inserted) {
    console.error('[post-comment] insert error:', iErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // Author identity for the response (single query, name + avatar). authorName
  // is returned RAW (null when unset) to match list-comments — the client
  // (CommentRow) renders the neutral fallback; only the notification copy
  // substitutes a fallback name.
  const { data: me } = await sb.from('users').select('display_name, avatar_url').eq('id', userId).maybeSingle();
  const displayName = ((me as { display_name?: string | null } | null)?.display_name) ?? null;
  const authorAvatarUrl = ((me as { avatar_url?: string | null } | null)?.avatar_url) ?? null;

  // Notify the listing owner (best-effort; skip self-comment).
  if (ownerId && ownerId !== userId) {
    notifyDetached(sb, {
      userIds: [ownerId],
      category: 'system',
      title: 'Nouveau commentaire',
      body: `${displayName ?? 'Un utilisateur Linky'} a commenté « ${title} ».`,
      iconHint: 'msg',
      deeplink: `/comments/${body.listing_kind}/${body.listing_id}`,
      app: 'marketplace',
    });
  }

  const row = inserted as { id: string; body: string; created_at: string };
  return {
    body: {
      comment: {
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        authorId: userId,
        authorName: displayName,
        authorAvatarUrl,
      },
    },
  };
}));
