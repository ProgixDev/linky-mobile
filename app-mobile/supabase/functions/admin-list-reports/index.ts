// Admin — la file des signalements. C'est la pièce « modération » que la
// politique Google Play exige à côté du signalement (report-content) et du
// blocage (block-user).
//
// Les 'pending' remontent les PLUS ANCIENS EN HAUT, à l'inverse du reste de la
// console : une file de modération se vide, elle ne se consulte pas. Un
// signalement qui attend depuis trois jours doit passer avant celui d'il y a
// dix minutes. Les statuts déjà tranchés, eux, se lisent du plus récent.
//
// L'APERÇU DE LA CIBLE est joint ici plutôt que laissé à l'admin : sans lui, il
// faudrait ouvrir cinq écrans différents pour savoir ce qui est reproché. Une
// cible supprimée entre-temps rend un aperçu nul, et c'est une information en
// soi — le contenu a déjà été retiré.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

type TargetKind = 'product' | 'property' | 'comment' | 'review' | 'user';

interface Body {
  status?: 'pending' | 'actioned' | 'dismissed';
  limit?: number;
}

const STATUSES = new Set<string>(['pending', 'actioned', 'dismissed']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

interface Row {
  id: string;
  target_kind: TargetKind;
  target_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
}

/** Ce qu'on affiche pour chaque type de cible, et où le lire. */
const PREVIEW: Record<
  TargetKind,
  { table: string; select: string; label: (r: Record<string, unknown>) => string }
> = {
  product: { table: 'products', select: 'id, title', label: (r) => String(r.title ?? '') },
  property: { table: 'properties', select: 'id, title', label: (r) => String(r.title ?? '') },
  comment: { table: 'comments', select: 'id, body', label: (r) => String(r.body ?? '') },
  review: {
    table: 'reviews',
    select: 'id, comment, rating',
    label: (r) => String(r.rating) + '/5 — ' + String(r.comment ?? '(sans texte)'),
  },
  user: { table: 'users', select: 'id, display_name', label: (r) => String(r.display_name ?? '(sans nom)') },
};

/** Clé d'aperçu — le couple (type, identifiant) est ce qui identifie une cible. */
const key = (kind: string, id: string) => kind + ':' + id;

Deno.serve(makePost<Body>('/v1/admin/reports/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const status = body.status ?? 'pending';
  const { data, error } = await sb
    .from('content_reports')
    .select(
      'id, target_kind, target_id, reporter_id, reason, details, status, reviewed_by, reviewed_at, admin_note, created_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(body.limit ?? 100);
  if (error) {
    console.error('[admin-list-reports] query:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as Row[] | null) ?? [];

  // Noms — signaleurs et admins qui ont tranché, en une seule requête.
  const names = new Map<string, string | null>();
  const peopleIds = [
    ...new Set(rows.flatMap((r) => [r.reporter_id, r.reviewed_by].filter(Boolean) as string[])),
  ];
  if (peopleIds.length > 0) {
    const { data: us } = await sb.from('users').select('id, display_name').in('id', peopleIds);
    for (const u of (us as { id: string; display_name: string | null }[] | null) ?? []) {
      names.set(u.id, u.display_name);
    }
  }

  // Aperçus — une requête par TYPE de cible présent, pas une par signalement.
  const previews = new Map<string, string>();
  for (const kind of [...new Set(rows.map((r) => r.target_kind))]) {
    const ids = [...new Set(rows.filter((r) => r.target_kind === kind).map((r) => r.target_id))];
    const spec = PREVIEW[kind];
    const { data: targets } = await sb.from(spec.table).select(spec.select).in('id', ids);
    for (const t of (targets as Record<string, unknown>[] | null) ?? []) {
      previews.set(key(kind, String(t.id)), spec.label(t));
    }
  }

  // Combien de fois la même cible a été signalée, toutes personnes et tous
  // statuts confondus — c'est le signal qui distingue une rancune isolée d'un
  // contenu que plusieurs personnes trouvent problématique.
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: all } = await sb
      .from('content_reports')
      .select('target_kind, target_id')
      .in('target_id', [...new Set(rows.map((r) => r.target_id))]);
    for (const a of (all as { target_kind: string; target_id: string }[] | null) ?? []) {
      const k = key(a.target_kind, a.target_id);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  return {
    body: {
      reports: rows.map((r) => {
        const k = key(r.target_kind, r.target_id);
        return {
          id: r.id,
          targetKind: r.target_kind,
          targetId: r.target_id,
          // null = la cible n'existe plus (déjà supprimée).
          targetPreview: previews.get(k) ?? null,
          reportCount: counts.get(k) ?? 1,
          reporterId: r.reporter_id,
          reporterName: names.get(r.reporter_id) ?? null,
          reason: r.reason,
          details: r.details,
          status: r.status,
          reviewedByName: r.reviewed_by ? names.get(r.reviewed_by) ?? null : null,
          reviewedAt: r.reviewed_at,
          adminNote: r.admin_note,
          createdAt: r.created_at,
        };
      }),
    },
  };
}));
