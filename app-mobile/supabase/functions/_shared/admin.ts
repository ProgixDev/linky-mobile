import type { SupabaseClient } from '@shared/db.ts';
import { throwApi } from '@shared/errors.ts';

// Admin gate for every privileged Phase K endpoint. Re-queries users.is_admin
// via the service-role client on every call — never trusts JWT claims. V1 has
// no JWT refresh cycle that would catch an is_admin revocation between the
// token's issuance and the request, so the live DB read is the single source
// of truth. The cost (one indexed PK lookup) is negligible against the
// security gain.
//
// Throws (status, code):
//   500 INTERNAL_ERROR  — Supabase select failed
//   404 USER_NOT_FOUND  — caller's user row was deleted between JWT issuance
//                         and the call (rare; the JWT was valid at sign time
//                         per requireUser, so this means a hard delete since)
//   403 FORBIDDEN_ADMIN — user exists but is_admin = false (the standard
//                         non-admin rejection path)
export async function assertAdmin(sb: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await sb
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[assertAdmin] users select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur vérification droits.');
  }
  if (!data) throwApi('USER_NOT_FOUND', 404, 'Utilisateur inconnu.');
  if (!data.is_admin) throwApi('FORBIDDEN_ADMIN', 403, 'Accès admin requis.');
}
