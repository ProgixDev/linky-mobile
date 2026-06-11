-- Phase T.1 follow-up — emergency roles backfill.
--
-- 20260611_03 stamped every existing user with roles = {buyer} (safe
-- default in isolation). But the SAME deploy added ROLE_REQUIRED gates on
-- product-create / property-create, so de-facto sellers and agents who
-- had been publishing without a server-side role were INSTANTLY 403'd in
-- production. The Mes-rôles recovery UI ships in T.2 (next commits), but
-- the gap window is unacceptable — this migration closes it.
--
-- Inference rules — most conservative first :
--   1) Anyone who owns a shop with at least one product → +seller.
--      Bare shop ownership is NOT enough on its own, because
--      property-create also auto-creates a shop ("Mon agence") for agents
--      and they'd be mis-tagged as sellers.
--   2) Anyone who owns at least one property → +agent.
--   3) Explicit shop creators with neither products nor properties yet
--      → +seller. These are pure sellers who ran the wizard far enough to
--      get a shop but haven't published a product yet ; they need the role
--      so they can complete their first publish.
--
-- The `||` array concat is fine alongside the users_roles_subset_check
-- because both 'seller' and 'agent' are in the allowed set ; the
-- users_roles_nonempty_check is also untouched since we only append.

-- 1) De-facto sellers.
update public.users u
   set roles = u.roles || array['seller']::text[]
 where not (u.roles @> array['seller']::text[])
   and exists (
     select 1 from public.shops s
       join public.products p on p.shop_id = s.id
      where s.owner_id = u.id
   );

-- 2) De-facto agents.
update public.users u
   set roles = u.roles || array['agent']::text[]
 where not (u.roles @> array['agent']::text[])
   and exists (
     select 1 from public.properties pr where pr.owner_id = u.id
   );

-- 3) Shop owners with no products AND no properties (explicit shop
--    creators who haven't published yet) → +seller.
update public.users u
   set roles = u.roles || array['seller']::text[]
 where not (u.roles @> array['seller']::text[])
   and exists (select 1 from public.shops s where s.owner_id = u.id)
   and not exists (select 1 from public.properties pr where pr.owner_id = u.id);
