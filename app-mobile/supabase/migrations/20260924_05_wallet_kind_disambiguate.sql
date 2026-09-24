-- DEUX CAISSES : « VENDEUR » ET « IMMO ». 2/2 — LA DESAMBIGUISATION.
--
-- La migration 20260924_04 a pose la colonne `kind` sans creer une seule caisse
-- Immo, precisement pour que rien ne change tant que CETTE migration-ci n'est
-- pas passee. Dix-neuf endroits resolvent un portefeuille par
-- `user_id + currency` ; des qu'une personne aura deux caisses, chacun d'eux
-- prendrait UNE ligne au hasard, sans erreur ni avertissement. Une vente
-- d'article pourrait crediter la caisse Immo, un retrait vider la mauvaise.
--
-- LA REGLE, EN UNE PHRASE : l'argent GAGNE comme professionnel va dans la
-- caisse de son metier ; tout le reste passe par la caisse « vendeur ».
--   * caisse IMMO    : loyers et ventes de biens encaisses (release_booking,
--                      la part du bailleur chez l'admin), et les mises en avant
--                      de biens, qui se paient sur la caisse qu'elles servent ;
--   * caisse SELLER  : ventes d'articles, achats, recharges, remboursements
--                      recus en tant qu'acheteur, boosts d'articles, retraits.
-- Un locataire qui paie son loyer est un ACHETEUR : il paie depuis sa caisse
-- vendeur. Seul le bailleur, qui encaisse, touche la caisse Immo. Sans quoi
-- toute personne ayant un jour loue un logement se retrouverait avec une caisse
-- Immo debitrice sans avoir jamais rien loue — exactement le symptome que le
-- client avait signale le 2026-09-09.
--
-- LE RETRAIT LIT SA CAISSE DANS LA DEMANDE (withdrawal_requests.wallet_kind,
-- pose par 20260924_04) : c'est le seul endroit ou le choix appartient a
-- l'utilisateur, donc le seul ou il doit etre stocke plutot que deduit.
--
-- FORME : un bloc par site, avec verification que le fragment existe et n'est
-- present qu'une fois. Une boucle sur une liste de fragments serait plus courte
-- mais l'API de gestion Supabase rejette les VALUES bourres de quotes (400,
-- corps vide) — constate le 2026-09-24.


do $p1$
declare v_src text; v_old text := 'where user_id = v_order.seller_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_force_resolve_order' limit 1;
  if v_src is null then raise exception 'admin_force_resolve_order introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'admin_force_resolve_order : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p1$;


do $p2$
declare v_src text; v_old text := 'where user_id = v_booking.landlord_id and currency = ''GNF'''; v_new text := 'where user_id = v_booking.landlord_id and kind = ''immo'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_resolve_booking' limit 1;
  if v_src is null then raise exception 'admin_resolve_booking introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'admin_resolve_booking : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p2$;


do $p3$
declare v_src text; v_old text := 'where user_id = v_booking.tenant_id and currency = ''GNF'''; v_new text := 'where user_id = v_booking.tenant_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_resolve_booking' limit 1;
  if v_src is null then raise exception 'admin_resolve_booking introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'admin_resolve_booking : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p3$;


do $p4$
declare v_src text; v_old text := 'where user_id = v_booking.tenant_id and currency = ''GNF'''; v_new text := 'where user_id = v_booking.tenant_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_paid_booking' limit 1;
  if v_src is null then raise exception 'cancel_paid_booking introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'cancel_paid_booking : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p4$;


do $p5$
declare v_src text; v_old text := 'where user_id = v_order.seller_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'confirm_order_receipt' limit 1;
  if v_src is null then raise exception 'confirm_order_receipt introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'confirm_order_receipt : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p5$;


do $p6$
declare v_src text; v_old text := 'where user_id = v_order.seller_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'livreur_confirm_handoff' limit 1;
  if v_src is null then raise exception 'livreur_confirm_handoff introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'livreur_confirm_handoff : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p6$;


do $p7$
declare v_src text; v_old text := 'where user_id = p_tenant_id and currency = ''GNF'''; v_new text := 'where user_id = p_tenant_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pay_booking_from_wallet' limit 1;
  if v_src is null then raise exception 'pay_booking_from_wallet introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'pay_booking_from_wallet : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p7$;


do $p8$
declare v_src text; v_old text := 'where user_id = p_buyer_id and currency = ''GNF'''; v_new text := 'where user_id = p_buyer_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order' limit 1;
  if v_src is null then raise exception 'place_order introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'place_order : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p8$;


do $p9$
declare v_src text; v_old text := 'where user_id = p_buyer_id and currency = ''GNF'''; v_new text := 'where user_id = p_buyer_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi' limit 1;
  if v_src is null then raise exception 'place_order_multi introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'place_order_multi : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p9$;


do $p10$
declare v_src text; v_old text := 'where user_id = p_buyer_id and currency = ''GNF'''; v_new text := 'where user_id = p_buyer_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_orders_batch' limit 1;
  if v_src is null then raise exception 'place_orders_batch introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'place_orders_batch : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p10$;


do $p11$
declare v_src text; v_old text := 'where user_id = p_seller_id and currency = ''GNF'''; v_new text := 'where user_id = p_seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchase_boost' limit 1;
  if v_src is null then raise exception 'purchase_boost introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'purchase_boost : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p11$;


do $p12$
declare v_src text; v_old text := 'where user_id = p_seller_id and currency = ''GNF'''; v_new text := 'where user_id = p_seller_id and kind = ''immo'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchase_property_boost' limit 1;
  if v_src is null then raise exception 'purchase_property_boost introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'purchase_property_boost : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p12$;


do $p13$
declare v_src text; v_old text := 'where user_id = v_order.buyer_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.buyer_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'refund_order_to_buyer' limit 1;
  if v_src is null then raise exception 'refund_order_to_buyer introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'refund_order_to_buyer : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p13$;


do $p14$
declare v_src text; v_old text := 'where user_id = v_booking.landlord_id and currency = ''GNF'''; v_new text := 'where user_id = v_booking.landlord_id and kind = ''immo'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_booking' limit 1;
  if v_src is null then raise exception 'release_booking introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'release_booking : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p14$;


do $p15$
declare v_src text; v_old text := 'where user_id = v_order.seller_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_dispute' limit 1;
  if v_src is null then raise exception 'resolve_dispute introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'resolve_dispute : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p15$;


do $p16$
declare v_src text; v_old text := 'where user_id = v_order.buyer_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.buyer_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_dispute' limit 1;
  if v_src is null then raise exception 'resolve_dispute introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'resolve_dispute : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p16$;


do $p17$
declare v_src text; v_old text := 'where user_id = v_order.seller_id and currency = ''GNF'''; v_new text := 'where user_id = v_order.seller_id and kind = ''seller'' and currency = ''GNF'''; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_confirm_pickup' limit 1;
  if v_src is null then raise exception 'seller_confirm_pickup introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'seller_confirm_pickup : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p17$;


do $p18$
declare v_src text; v_old text := 'where w.user_id = v_topup.user_id and w.currency = v_topup.currency'; v_new text := 'where w.user_id = v_topup.user_id and w.kind = ''seller'' and w.currency = v_topup.currency'; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'confirm_topup' limit 1;
  if v_src is null then raise exception 'confirm_topup introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'confirm_topup : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p18$;


do $p19$
declare v_src text; v_old text := 'where user_id = v_req.user_id and currency = v_req.currency'; v_new text := 'where user_id = v_req.user_id and kind = v_req.wallet_kind and currency = v_req.currency'; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'process_withdrawal' limit 1;
  if v_src is null then raise exception 'process_withdrawal introuvable'; end if;
  if position(v_new in v_src) > 0 then return; end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'process_withdrawal : fragment attendu 1 fois, trouve %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$p19$;


-- Durcissement 2026-07-29 : un CREATE OR REPLACE via EXECUTE peut re-ouvrir les
-- droits par defaut sur les fonctions SECURITY DEFINER.
do $g$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%public.wallets%'
       and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$g$;
