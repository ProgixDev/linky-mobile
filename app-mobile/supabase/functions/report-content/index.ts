// Signaler un contenu ou un utilisateur. Authentifié.
//
// Exigence de la politique Google Play sur le contenu généré par les
// utilisateurs : il faut un moyen, dans l'application, de signaler un contenu
// répréhensible. Le signalement atterrit dans content_reports, que la console
// admin dépile (admin-list-reports / admin-resolve-report) et où elle disposait
// déjà des actions de suppression (admin-delete-comment, admin-delete-review).
//
// IDEMPOTENT PAR CONSTRUCTION : l'UNIQUE (reporter_id, target_kind, target_id)
// fait qu'un second signalement de la même cible par la même personne ne crée
// rien. On renvoie `already: true` plutôt qu'une erreur — pour l'utilisateur,
// signaler deux fois n'est pas un échec, et un message d'erreur laisserait
// croire que son premier signalement n'est pas passé.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type TargetKind = 'product' | 'property' | 'comment' | 'review' | 'user';

interface Body {
  target_kind: TargetKind;
  target_id: string;
  reason: 'spam' | 'illegal' | 'offensive' | 'scam' | 'wrong_info' | 'other';
  details?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const KINDS = new Set<string>(['product', 'property', 'comment', 'review', 'user']);
const REASONS = new Set<string>(['spam', 'illegal', 'offensive', 'scam', 'wrong_info', 'other']);

/** La table qui porte chaque type de cible — sert à vérifier qu'elle existe. */
const TABLE: Record<TargetKind, string> = {
  product: 'products',
  property: 'properties',
  comment: 'comments',
  review: 'reviews',
  user: 'users',
};

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.target_kind !== 'string' || !KINDS.has(x.target_kind)) return false;
  if (typeof x.target_id !== 'string' || !UUID_RE.test(x.target_id)) return false;
  if (typeof x.reason !== 'string' || !REASONS.has(x.reason)) return false;
  if (x.details !== undefined) {
    if (typeof x.details !== 'string') return false;
    if (x.details.length > 1000) return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/reports/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // On ne se signale pas soi-même. Signaler sa propre annonce est en revanche
  // toléré : c'est sans effet utile mais sans dommage, et un vendeur qui le
  // fait par erreur n'a pas besoin d'un refus à comprendre.
  if (body.target_kind === 'user' && body.target_id === userId) {
    throwApi('SELF_REPORT', 400, 'On ne peut pas se signaler soi-même.');
  }

  // La cible doit exister — sinon la file de modération se remplirait de
  // signalements pointant dans le vide, indistinguables d'un contenu supprimé
  // après coup (celui-là, on veut le garder).
  const { data: target, error: tErr } = await sb
    .from(TABLE[body.target_kind])
    .select('id')
    .eq('id', body.target_id)
    .maybeSingle();
  if (tErr) {
    console.error('[report-content] target lookup:', tErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!target) throwApi('TARGET_NOT_FOUND', 404, 'Ce contenu n\'existe plus.');

  const details = body.details?.trim();
  const { data: inserted, error } = await sb
    .from('content_reports')
    .insert({
      target_kind: body.target_kind,
      target_id: body.target_id,
      reporter_id: userId,
      reason: body.reason,
      details: details && details.length > 0 ? details : null,
    })
    // Le doublon est un no-op : on ne renvoie simplement aucune ligne.
    .select('id')
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation : cette personne a déjà signalé cette cible.
    if ((error as { code?: string }).code === '23505') {
      return { body: { already: true } };
    }
    console.error('[report-content] insert:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { report_id: inserted?.id ?? null, already: false } };
}));
