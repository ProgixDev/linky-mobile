// Livreur availability toggle — the courier flips online/offline. Authed
// (requireUser → caller). Only a user carrying the 'livreur' role may toggle;
// the flag lives on users.is_online and is surfaced to the admin dispatch
// (admin-list-livreurs) and read back by the driver app (application-status).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  online: boolean;
}

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>).online === 'boolean';
}

Deno.serve(makePost<Body>('/v1/livreur/availability/set', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: user, error: uErr } = await sb
    .from('users')
    .select('roles')
    .eq('id', userId)
    .maybeSingle();
  if (uErr) {
    console.error('[set-livreur-availability] user read error:', uErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const roles = (user as { roles?: string[] } | null)?.roles ?? [];
  if (!roles.includes('livreur')) {
    throwApi('NOT_LIVREUR', 403, 'Action réservée aux livreurs.');
  }

  const { error } = await sb.from('users').update({ is_online: body.online }).eq('id', userId);
  if (error) {
    console.error('[set-livreur-availability] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { online: body.online } };
}));
