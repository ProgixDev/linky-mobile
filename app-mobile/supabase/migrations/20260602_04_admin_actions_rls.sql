-- =====================================================================
-- Phase K hotfix — enable RLS on admin_actions to close Data API exposure.
-- =====================================================================
-- Without RLS, public.admin_actions was queryable by any caller holding the
-- anon publishable key via the auto-generated Data API (SELECT
-- /rest/v1/admin_actions). That leaks the full audit trail: which admin
-- resolved which dispute, before/after order snapshots including amounts +
-- buyer/seller ids + scan_tokens if any, reasoning, etc.
--
-- RLS-enable + zero policy = deny by default for anon and authenticated
-- roles. service_role bypasses RLS by design, so the Phase K edge functions
-- (list-disputes, get-dispute, resolve-dispute) continue to work since they
-- use the service-role client via _shared/db.ts serviceClient().
--
-- V1.1 may add a read policy for authenticated admin users if we ever want
-- to expose the audit log directly to the Next.js admin app without going
-- through an edge fn — until then, the edge fns are the single way in.

alter table public.admin_actions enable row level security;
