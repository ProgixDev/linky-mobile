-- ============================================================================
-- L'ACHETEUR NE SCANNE PLUS JAMAIS. Client 2026-08-22 : « le client ne scanne
-- jamais un QR, il génère seulement un QR pour sa commande ».
--
-- Le modèle devient uniforme : l'acheteur AFFICHE toujours son QR, et CELUI QUI
-- REMET LA MARCHANDISE le scanne — le livreur pour une livraison, le vendeur
-- pour un retrait en boutique.
--
-- CE QUE CETTE FONCTION DÉBLOQUE : jusqu'ici, une commande sans livreur ne
-- pouvait être confirmée QUE par l'acheteur scannant un QR imprimé par le
-- vendeur (confirm_order_receipt, réservée a l'acheteur). Retirer le scanner de
-- l'acheteur sans cette fonction aurait rendu tout retrait en boutique
-- inconfirmable — l'argent serait resté bloqué en séquestre jusqu'a un litige.
--
-- POURQUOI C'EST SÛR QUE LE VENDEUR LIBÈRE LES FONDS : il ne le peut qu'en
-- scannant le QR affiché sur le TÉLÉPHONE DE L'ACHETEUR. Le scan_token n'est
-- jamais imprimé ni transmis au vendeur par un autre canal ; il faut donc que
-- l'acheteur soit physiquement présent, écran en main. C'est exactement la même
-- garantie que celle du livreur (livreur_confirm_handoff).
--
-- GARDE-FOU : si un livreur est assigné, le vendeur ne peut PAS confirmer.
-- Sans cela, un vendeur pourrait libérer le séquestre d'une commande confiée a
-- un livreur, avant même que l'acheteur ne l'ait reçue.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

create or replace function public.seller_confirm_pickup(
  p_order_id   uuid,
  p_seller_id  uuid,
  p_scan_token uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order              record;
  v_livreur            uuid;
  v_seller_wallet_id   uuid;
  v_escrow_wallet_id   uuid;
  v_platform_wallet_id uuid;
  v_now                timestamptz := now();
begin
  select id, buyer_id, seller_id, amount_minor, fees_minor, delivery_fee_minor,
         status, events, scan_token
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.seller_id <> p_seller_id then
    raise exception 'ORDER_NOT_SELLER';
  end if;

  -- Mêmes états que confirm_order_receipt : payée, en préparation, ou déja
  -- marquée livrée mais pas encore libérée.
  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  -- Un livreur assigné = c'est LUI qui confirme la remise, pas le vendeur.
  select livreur_id into v_livreur
    from public.deliveries
    where order_id = p_order_id;
  if v_livreur is not null then
    raise exception 'LIVREUR_ASSIGNED';
  end if;

  -- Le verrou : sans le QR de l'acheteur, aucune libération.
  if v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;

  insert into public.wallets (user_id, currency)
    values (v_order.seller_id, 'GNF')
    on conflict (user_id, currency) do nothing;

  select id into v_seller_wallet_id
    from public.wallets
    where user_id = v_order.seller_id and currency = 'GNF';

  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  select id into v_platform_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

  if v_seller_wallet_id is null or v_escrow_wallet_id is null or v_platform_wallet_id is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  -- Répartition identique a confirm_order_receipt, au franc près : le vendeur
  -- reçoit le montant des articles, la plateforme la commission et le frais de
  -- livraison. Le séquestre revient a zéro.
  perform public.post_transfer(
    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
    'order_release', v_order.id
  );
  perform public.post_transfer(
    v_escrow_wallet_id, v_platform_wallet_id,
    v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
    'order_platform_fee', v_order.id
  );

  update public.orders
    set status = 'released',
        events = v_order.events || jsonb_build_array(
                   jsonb_build_object('at', v_now, 'label', 'Remise confirmée par le vendeur')
                 ),
        updated_at = v_now
    where id = v_order.id;
end;
$$;

-- Supabase accorde EXECUTE a anon/authenticated par defaut sur toute fonction
-- SECURITY DEFINER : sans ce retrait, la routine serait appelable depuis
-- Internet — et celle-ci deplace de l'argent.
revoke all on function public.seller_confirm_pickup(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.seller_confirm_pickup(uuid, uuid, uuid) to service_role;
