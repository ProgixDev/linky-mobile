-- Sortir du sequestre les frais de livraison qui y sont restes coinces.
--
-- CE QUE 20260907_05 A FAIT, ET CE QU'ELLE N'A PAS FAIT. Elle a corrige le
-- CODE : trois des quatre chemins de sortie oubliaient delivery_fee_minor. Elle
-- n'a deliberement pas touche a l'argent DEJA bloque — corriger un programme et
-- deplacer des fonds existants sont deux gestes differents, et le second se
-- fait en connaissance de cause. C'est ce geste-ci.
--
-- L'ETAT MESURE LE 2026-09-07, AVANT :
--   solde reel du sequestre ......................... 37 660 GNF
--   du aux 3 commandes vivantes ..................... 22 660 GNF
--   orphelin ........................................ 15 000 GNF
-- Ces 15 000 GNF sont le frais de livraison de LK-2026-10070, une commande deja
-- 'released'. Son vendeur a ete paye, la plateforme a touche ses frais de
-- service, mais le frais de livraison n'a jamais quitte le sequestre. Il
-- n'appartient plus a personne et personne ne le reclamera.
--
-- OU IL DOIT ALLER. Exactement la ou les fonctions corrigees l'auraient envoye :
--   'released' -> la PLATEFORME. C'est Linky qui opere la livraison ; le frais
--                 la remunere, au meme titre que les frais de service.
--   'refunded' -> l'ACHETEUR. Il avait paye une livraison qui n'a pas eu lieu.
-- Aucune commande 'refunded' n'est dans ce cas aujourd'hui, mais la branche est
-- ecrite : une migration qui ne traite qu'un seul cas parce que c'est le seul
-- observe se trompe des que le second apparait.
--
-- CE QUI REND CETTE MIGRATION SURE :
--   - elle ne bouge QUE les commandes terminees (released / refunded) dont le
--     sequestre retient encore EXACTEMENT delivery_fee_minor, et rien d'autre.
--     Une commande vivante, ou un solde qui ne tombe pas juste, est ignoree :
--     on ne devine pas avec de l'argent ;
--   - elle est idempotente. Apres le transfert le solde tombe a zero, donc la
--     condition ne se represente jamais ;
--   - elle passe par post_transfer, comme tout le reste. Aucune ecriture
--     directe dans ledger_entries : le solde se recalcule tout seul et les deux
--     jambes restent appariees ;
--   - elle inscrit un evenement sur la commande. Un mouvement d'argent sans
--     trace lisible est un mouvement que personne ne pourra expliquer plus tard.

do $orphans$
declare
  r                record;
  v_escrow_wallet  uuid;
  v_platform       uuid;
  v_target         uuid;
  v_label          text;
  v_ref_type       text;
  v_now            timestamptz := now();
  v_count          int := 0;
  v_total          bigint := 0;
begin
  select id into v_escrow_wallet
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  select id into v_platform
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

  for r in
    select o.id, o.reference, o.status, o.buyer_id, o.events,
           coalesce(o.delivery_fee_minor, 0) as fee
      from public.orders o
     where o.status in ('released', 'refunded')
       and coalesce(o.delivery_fee_minor, 0) > 0
       and public.order_escrow_balance(o.id) = coalesce(o.delivery_fee_minor, 0)
     order by o.created_at
  loop
    if r.status = 'released' then
      v_target   := v_platform;
      v_ref_type := 'order_platform_fee';
      v_label    := 'Frais de livraison versé à la plateforme (régularisation)';
    else
      insert into public.wallets (user_id, currency)
        values (r.buyer_id, 'GNF')
        on conflict (user_id, currency) do nothing;
      select id into v_target
        from public.wallets
       where user_id = r.buyer_id and currency = 'GNF';
      v_ref_type := 'order_fee_refund';
      v_label    := 'Frais de livraison remboursé à l''acheteur (régularisation)';
    end if;

    perform public.post_transfer(v_escrow_wallet, v_target, r.fee, v_ref_type, r.id);

    update public.orders
       set events = r.events || jsonb_build_array(jsonb_build_object(
             'at', v_now,
             'label', v_label,
             'kind', 'delivery_fee_reconciliation',
             'amount_minor', r.fee,
             'note', 'Régularisation du trou corrigé par 20260907_05 : ce frais était resté au séquestre.')),
           updated_at = v_now
     where id = r.id;

    v_count := v_count + 1;
    v_total := v_total + r.fee;
    raise notice 'regularise % : % GNF -> %', r.reference, r.fee, v_ref_type;
  end loop;

  raise notice 'total : % commande(s), % GNF sortis du sequestre', v_count, v_total;
end $orphans$;
