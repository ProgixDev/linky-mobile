-- ===========================================================================
-- SONDE : le portefeuille livreur (migration 20261031_01)
-- ===========================================================================
--
-- CE QUE LA SONDE PROUVE, sur une vraie remise (livreur_confirm_handoff) :
--   1. le livreur est crédité de 100 % des frais de livraison, dans sa caisse
--      'livreur', et la plateforme ne garde que les frais de service ;
--   2. un second appel ne paie pas deux fois ('already_paid') ;
--   3. le livreur peut retirer depuis sa caisse (retenue), et annuler (rendu) ;
--   4. l'historique et les origines du portefeuille LINKY ne montrent rien
--      de la caisse livreur ;
--   5. pas de paie : commande en espèces, livraison d'avant le 2026-10-31,
--      commande dont la plateforme n'a jamais encaissé les frais.
--
-- SON CONTRÔLE NÉGATIF : NEG = true supprime les deux déclencheurs (ce qui
-- existait avant) et la sonde DOIT échouer à l'étape 1 sur :
--     ECHEC : le livreur n'a pas ete paye a la remise
--
-- COMMENT LA LANCER : éditeur SQL ou POST .../database/query, APRÈS la
-- migration (ou concaténée derrière elle, avant application). Se termine par
-- `rollback` : rien ne reste. Emprunte une commande réelle pour ses
-- clés étrangères (boutique, produit) et trois vrais comptes distincts.
-- ===========================================================================

begin;

do $t$
declare
  NEG        constant boolean := false;   -- true = controle negatif
  FEE        constant bigint := 15000;
  v_src      record;
  v_buyer    uuid;
  v_liv      uuid;
  v_order    uuid;
  v_token    uuid;
  v_escrow   uuid;
  v_platform uuid;
  v_wl       uuid;
  v_bal      bigint;
  v_n        int;
  v_out      text;
  v_req      uuid;
  v_plat_before bigint;
  v_plat_after  bigint;
  v_o2       uuid;
  v_case     text;
  v_pm       text;
  v_at       timestamptz;
  v_expect   text;
begin
  if NEG then
    drop trigger trg_pay_livreur_on_order_release on public.orders;
    drop trigger trg_pay_livreur_on_delivered on public.deliveries;
    raise notice 'CONTROLE NEGATIF : declencheurs retires';
  end if;

  -- Une commande reelle pour les cles etrangeres ; trois comptes distincts,
  -- jamais les comptes systeme.
  select o.seller_id, o.shop_id, o.product_id, o.product_snapshot into v_src
    from public.orders o
   where o.seller_id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by o.created_at desc limit 1;
  select id into v_buyer from public.users
   where id <> v_src.seller_id
     and id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by created_at limit 1;
  select id into v_liv from public.users
   where id not in (v_src.seller_id, v_buyer,
                    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by created_at limit 1;
  if v_src.seller_id is null or v_buyer is null or v_liv is null then
    raise exception 'pas de jeu de donnees';
  end if;

  select id into v_escrow from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  select id into v_platform from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002' and kind = 'seller' and currency = 'GNF';

  -- Une commande payee par mobile money, a livrer, assignee et en route.
  insert into public.orders
    (reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity,
     amount_minor, fees_minor, total_minor, payment_method, status, delivery_mode,
     delivery_fee_minor, stock_taken)
  values
    ('PROBE-LIV-' || left(gen_random_uuid()::text, 8), v_buyer, v_src.seller_id, v_src.shop_id,
     v_src.product_id, v_src.product_snapshot, 1,
     100000, 5000, 100000 + 5000 + FEE, 'mtn-money', 'paid', 'delivery', FEE, false)
  returning id, scan_token into v_order, v_token;
  update public.deliveries
     set livreur_id = v_liv, status = 'in_transit', assigned_at = now(), pickup_at = now()
   where order_id = v_order;

  -- Le sequestre recoit ce que l'acheteur a paye.
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
  values (v_escrow, 'credit', 100000 + 5000 + FEE,
          coalesce((select sum(case when direction = 'credit' then amount_minor else -amount_minor end)
                      from public.ledger_entries where wallet_id = v_escrow), 0) + 100000 + 5000 + FEE,
          'order_escrow', v_order);

  v_plat_before := coalesce((select sum(case when direction = 'credit' then amount_minor else -amount_minor end)
                               from public.ledger_entries where wallet_id = v_platform), 0);

  -- ══ 1 : la remise paie le livreur ════════════════════════════════════════
  perform public.livreur_confirm_handoff(v_order, v_liv, v_token);

  select id into v_wl from public.wallets where user_id = v_liv and kind = 'livreur' and currency = 'GNF';
  if v_wl is null
     or not exists (select 1 from public.ledger_entries
                     where wallet_id = v_wl and ref_type = 'livreur_delivery_fee'
                       and ref_id = v_order and direction = 'credit' and amount_minor = FEE) then
    raise exception 'ECHEC : le livreur n-a pas ete paye a la remise';
  end if;
  v_plat_after := (select sum(case when direction = 'credit' then amount_minor else -amount_minor end)
                     from public.ledger_entries where wallet_id = v_platform);
  if v_plat_after - v_plat_before <> 5000 then
    raise exception 'ECHEC : la plateforme garde % au lieu des 5000 de frais de service', v_plat_after - v_plat_before;
  end if;

  -- ══ 2 : jamais deux fois ═════════════════════════════════════════════════
  v_out := public.pay_livreur_delivery_fee(v_order);
  if v_out <> 'already_paid' then raise exception 'ECHEC : second appel -> %', v_out; end if;
  perform public.pay_pending_livreur_fees();
  select count(*) into v_n from public.ledger_entries
   where ref_type = 'livreur_delivery_fee' and ref_id = v_order and direction = 'credit';
  if v_n <> 1 then raise exception 'ECHEC : % paie(s) pour une livraison', v_n; end if;

  -- ══ 3 : retirer depuis la caisse livreur, puis annuler ══════════════════
  select id into v_req from public.request_withdrawal(v_liv, 'GNF', 10000, 'Orange Money - 622 33 44 55', 'livreur');
  if (select wallet_kind from public.withdrawal_requests where id = v_req) <> 'livreur' then
    raise exception 'ECHEC : le retrait ne porte pas sur la caisse livreur';
  end if;
  v_bal := (select balance_after from public.ledger_entries where wallet_id = v_wl
             order by created_at desc, id desc limit 1);
  if v_bal <> FEE - 10000 then raise exception 'ECHEC : solde % apres retenue', v_bal; end if;
  perform public.cancel_withdrawal(v_req, v_liv);
  v_bal := (select balance_after from public.ledger_entries where wallet_id = v_wl
             order by created_at desc, id desc limit 1);
  if v_bal <> FEE then raise exception 'ECHEC : solde % apres annulation', v_bal; end if;
  begin
    perform public.request_withdrawal(v_liv, 'GNF', FEE + 1, 'Orange Money - 622 33 44 55', 'livreur');
    raise exception 'ECHEC : retrait au-dela du solde accepte';
  exception when others then
    if sqlerrm <> 'insufficient_funds' then raise; end if;
  end;

  -- ══ 4 : l'app Linky ne voit pas la caisse livreur ═══════════════════════
  if exists (select 1 from public.get_wallet_history(v_liv, null, null, 100) h where h.wallet_id = v_wl) then
    raise exception 'ECHEC : l-historique Linky montre la caisse livreur';
  end if;
  if exists (select 1 from public.get_wallet_origin_breakdown(v_liv) o where o.kind = 'livreur') then
    raise exception 'ECHEC : les origines Linky montrent la caisse livreur';
  end if;
  -- ... mais la garde de suppression de compte, elle, la compte.
  if not exists (select 1 from public.get_wallet_balances(v_liv) b where b.kind = 'livreur' and b.balance_minor = FEE) then
    raise exception 'ECHEC : get_wallet_balances ignore la caisse livreur';
  end if;

  -- ══ 5 : les cas ou l'on ne paie pas ═════════════════════════════════════
  -- Le grand livre est immuable (ledger_entries_no_delete) : chaque cas a sa
  -- propre commande, deja liberee, dont la livraison passe 'delivered' — ce
  -- qui declenche la paie comme en vrai.
  for v_case, v_pm, v_at, v_expect in
    select * from (values
      ('especes',             'cod',       now(),                                   'no_money_in_escrow'),
      ('frais non encaisses', 'mtn-money', now(),                                   'fee_not_collected'),
      ('avant le 2026-10-31', 'mtn-money', '2026-08-22 10:00:00+00'::timestamptz,   'before_cutoff')
    ) as c(a, b, d, e)
  loop
    insert into public.orders
      (reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity,
       amount_minor, fees_minor, total_minor, payment_method, status, delivery_mode,
       delivery_fee_minor, stock_taken)
    values
      ('PROBE-LIV-' || left(gen_random_uuid()::text, 8), v_buyer, v_src.seller_id, v_src.shop_id,
       v_src.product_id, v_src.product_snapshot, 1,
       100000, 5000, 100000 + 5000 + FEE, v_pm, 'released', 'delivery', FEE, false)
    returning id into v_o2;
    update public.deliveries
       set livreur_id = v_liv, status = 'delivered', assigned_at = now(), delivered_at = v_at
     where order_id = v_o2;
    v_out := public.pay_livreur_delivery_fee(v_o2);
    if v_out <> v_expect then raise exception 'ECHEC : % -> % (attendu %)', v_case, v_out, v_expect; end if;
    if exists (select 1 from public.ledger_entries
                where ref_type = 'livreur_delivery_fee' and ref_id = v_o2) then
      raise exception 'ECHEC : % a paye le livreur', v_case;
    end if;
  end loop;

  raise notice 'portefeuille livreur : paye a la remise, une seule fois, retirable, invisible dans Linky';
end
$t$;

rollback;
