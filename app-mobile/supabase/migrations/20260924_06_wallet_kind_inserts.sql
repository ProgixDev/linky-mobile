-- DEUX CAISSES. 2 bis — LES CREATIONS DE PORTEFEUILLE.
--
-- Defaut trouve par le test FONCTIONNEL de 20260924_05, et par lui seul : les
-- controles de texte disaient que tout etait desambigue, et la liberation d'un
-- loyer echouait quand meme avec « there is no unique or exclusion constraint
-- matching the ON CONFLICT specification ».
--
-- La cause : quatorze fonctions creent le portefeuille s'il manque, avec
--     insert into public.wallets (user_id, currency) values (X, 'GNF')
--       on conflict (user_id, currency) do ...
-- et 20260924_04 a remplace cette unicite par (user_id, kind, currency). La
-- clause ON CONFLICT ne designait donc plus aucune contrainte. Une migration
-- qui change une cle d'unicite doit suivre TOUTES les clauses ON CONFLICT qui
-- la nommaient — elles ne se contentent pas de la lire, elles l'exigent.
--
-- Chaque creation recoit donc la caisse qui lui revient, selon la meme regle
-- que les lectures : l'argent gagne comme professionnel va dans la caisse de
-- son metier, tout le reste dans la caisse vendeur. Deux sites basculent en
-- 'immo' : le bailleur dans release_booking et le bailleur dans
-- admin_resolve_booking. Dans cette derniere, le locataire garde 'seller' — il
-- paie en acheteur, il n'encaisse pas en professionnel.


do $c1$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_force_resolve_order' limit 1;
  if v_src is null then raise exception 'admin_force_resolve_order introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.seller_id, ''GNF'')', ''))) / length('values (v_order.seller_id, ''GNF'')') <> 1 then
    raise exception 'admin_force_resolve_order : valeurs v_order.seller_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.seller_id, ''GNF'')', 'values (v_order.seller_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'admin_force_resolve_order : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c1$;


do $c2$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_resolve_booking' limit 1;
  if v_src is null then raise exception 'admin_resolve_booking introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_booking.tenant_id, ''GNF'')', ''))) / length('values (v_booking.tenant_id, ''GNF'')') <> 1 then
    raise exception 'admin_resolve_booking : valeurs v_booking.tenant_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_booking.tenant_id, ''GNF'')', 'values (v_booking.tenant_id, ''seller'', ''GNF'')');
  if (length(v_new) - length(replace(v_new, 'values (v_booking.landlord_id, ''GNF'')', ''))) / length('values (v_booking.landlord_id, ''GNF'')') <> 1 then
    raise exception 'admin_resolve_booking : valeurs v_booking.landlord_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_booking.landlord_id, ''GNF'')', 'values (v_booking.landlord_id, ''immo'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'admin_resolve_booking : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c2$;


do $c3$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_paid_booking' limit 1;
  if v_src is null then raise exception 'cancel_paid_booking introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_booking.tenant_id, ''GNF'')', ''))) / length('values (v_booking.tenant_id, ''GNF'')') <> 1 then
    raise exception 'cancel_paid_booking : valeurs v_booking.tenant_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_booking.tenant_id, ''GNF'')', 'values (v_booking.tenant_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'cancel_paid_booking : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c3$;


do $c4$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'confirm_order_receipt' limit 1;
  if v_src is null then raise exception 'confirm_order_receipt introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.seller_id, ''GNF'')', ''))) / length('values (v_order.seller_id, ''GNF'')') <> 1 then
    raise exception 'confirm_order_receipt : valeurs v_order.seller_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.seller_id, ''GNF'')', 'values (v_order.seller_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'confirm_order_receipt : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c4$;


do $c5$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'confirm_topup' limit 1;
  if v_src is null then raise exception 'confirm_topup introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_topup.user_id, v_topup.currency)', ''))) / length('values (v_topup.user_id, v_topup.currency)') <> 1 then
    raise exception 'confirm_topup : valeurs v_topup.user_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_topup.user_id, v_topup.currency)', 'values (v_topup.user_id, ''seller'', v_topup.currency)');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'confirm_topup : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c5$;


do $c6$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'livreur_confirm_handoff' limit 1;
  if v_src is null then raise exception 'livreur_confirm_handoff introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.seller_id, ''GNF'')', ''))) / length('values (v_order.seller_id, ''GNF'')') <> 1 then
    raise exception 'livreur_confirm_handoff : valeurs v_order.seller_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.seller_id, ''GNF'')', 'values (v_order.seller_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'livreur_confirm_handoff : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c6$;


do $c7$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pay_booking_from_wallet' limit 1;
  if v_src is null then raise exception 'pay_booking_from_wallet introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (p_tenant_id, ''GNF'')', ''))) / length('values (p_tenant_id, ''GNF'')') <> 1 then
    raise exception 'pay_booking_from_wallet : valeurs p_tenant_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (p_tenant_id, ''GNF'')', 'values (p_tenant_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'pay_booking_from_wallet : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c7$;


do $c8$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order' limit 1;
  if v_src is null then raise exception 'place_order introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (p_buyer_id, ''GNF'')', ''))) / length('values (p_buyer_id, ''GNF'')') <> 1 then
    raise exception 'place_order : valeurs p_buyer_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (p_buyer_id, ''GNF'')', 'values (p_buyer_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'place_order : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c8$;


do $c9$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi' limit 1;
  if v_src is null then raise exception 'place_order_multi introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (p_buyer_id, ''GNF'')', ''))) / length('values (p_buyer_id, ''GNF'')') <> 1 then
    raise exception 'place_order_multi : valeurs p_buyer_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (p_buyer_id, ''GNF'')', 'values (p_buyer_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'place_order_multi : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c9$;


do $c10$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_orders_batch' limit 1;
  if v_src is null then raise exception 'place_orders_batch introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (p_buyer_id, ''GNF'')', ''))) / length('values (p_buyer_id, ''GNF'')') <> 1 then
    raise exception 'place_orders_batch : valeurs p_buyer_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (p_buyer_id, ''GNF'')', 'values (p_buyer_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'place_orders_batch : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c10$;


do $c11$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'refund_order_to_buyer' limit 1;
  if v_src is null then raise exception 'refund_order_to_buyer introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.buyer_id, ''GNF'')', ''))) / length('values (v_order.buyer_id, ''GNF'')') <> 1 then
    raise exception 'refund_order_to_buyer : valeurs v_order.buyer_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.buyer_id, ''GNF'')', 'values (v_order.buyer_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'refund_order_to_buyer : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c11$;


do $c12$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_booking' limit 1;
  if v_src is null then raise exception 'release_booking introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_booking.landlord_id, ''GNF'')', ''))) / length('values (v_booking.landlord_id, ''GNF'')') <> 1 then
    raise exception 'release_booking : valeurs v_booking.landlord_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_booking.landlord_id, ''GNF'')', 'values (v_booking.landlord_id, ''immo'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'release_booking : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c12$;


do $c13$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_dispute' limit 1;
  if v_src is null then raise exception 'resolve_dispute introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.buyer_id, ''GNF'')', ''))) / length('values (v_order.buyer_id, ''GNF'')') <> 1 then
    raise exception 'resolve_dispute : valeurs v_order.buyer_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.buyer_id, ''GNF'')', 'values (v_order.buyer_id, ''seller'', ''GNF'')');
  if (length(v_new) - length(replace(v_new, 'values (v_order.seller_id, ''GNF'')', ''))) / length('values (v_order.seller_id, ''GNF'')') <> 1 then
    raise exception 'resolve_dispute : valeurs v_order.seller_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.seller_id, ''GNF'')', 'values (v_order.seller_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'resolve_dispute : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c13$;


do $c14$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_confirm_pickup' limit 1;
  if v_src is null then raise exception 'seller_confirm_pickup introuvable'; end if;
  if position('on conflict (user_id, currency)' in v_src) = 0 then return; end if;

  v_new := replace(v_src, 'insert into public.wallets (user_id, currency)',
                          'insert into public.wallets (user_id, kind, currency)');
  v_new := replace(v_new, 'on conflict (user_id, currency)',
                          'on conflict (user_id, kind, currency)');
  if (length(v_new) - length(replace(v_new, 'values (v_order.seller_id, ''GNF'')', ''))) / length('values (v_order.seller_id, ''GNF'')') <> 1 then
    raise exception 'seller_confirm_pickup : valeurs v_order.seller_id introuvables ou multiples';
  end if;
  v_new := replace(v_new, 'values (v_order.seller_id, ''GNF'')', 'values (v_order.seller_id, ''seller'', ''GNF'')');
  if position('on conflict (user_id, currency)' in v_new) > 0 then
    raise exception 'seller_confirm_pickup : une clause on conflict est restee sur l ancienne cle';
  end if;
  execute v_new;
end
$c14$;


-- Durcissement 2026-07-29.
do $g$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and pg_get_functiondef(p.oid) like '%public.wallets%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$g$;
