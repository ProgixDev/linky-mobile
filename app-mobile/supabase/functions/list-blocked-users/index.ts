// La liste des personnes que l'appelant a bloquées, pour l'écran de réglages
// où il peut les débloquer.
//
// ┌─ ASYMÉTRIE VOULUE ───────────────────────────────────────────────────────┐
// Le FILTRE de blocage est symétrique (cf. _shared/blocks.ts) : si A bloque B,
// chacun disparaît de la vue de l'autre. Cette LISTE, elle, ne rend que les
// lignes dont l'appelant est le blocker_id. Révéler à quelqu'un qui l'a bloqué
// serait une fuite, et surtout une invitation à contourner le blocage par un
// autre canal — c'est précisément la personne dont on veut être invisible.
// └──────────────────────────────────────────────────────────────────────────┘
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { limit?: number }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/blocks/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb
    .from('blocked_users')
    .select('blocked_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })
    .limit(body.limit ?? 100);
  if (error) { console.error('[list-blocked-users] query:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const rows = (data as { blocked_id: string; created_at: string }[] | null) ?? [];

  // Noms et avatars en une requête groupée (convention du projet).
  const byId = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (rows.length > 0) {
    const { data: us } = await sb
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', rows.map((r) => r.blocked_id));
    for (const u of (us as { id: string; display_name: string | null; avatar_url: string | null }[] | null) ?? []) {
      byId.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url });
    }
  }

  return {
    body: {
      blocked: rows.map((r) => ({
        userId: r.blocked_id,
        // On montre le nom même si le profil est privé : l'appelant a déjà
        // interagi avec cette personne, et une liste de « Utilisateur,
        // Utilisateur, Utilisateur » serait inutilisable pour débloquer.
        displayName: byId.get(r.blocked_id)?.display_name ?? null,
        avatarUrl: byId.get(r.blocked_id)?.avatar_url ?? null,
        blockedAt: r.created_at,
      })),
    },
  };
}));
