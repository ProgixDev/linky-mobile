-- Le levier admin pouvait liberer une commande avec l'argent d'une autre.
--
-- TROUVE EN RELISANT A CHARGE le code d'argent ecrit le 2026-09-07, avant qu'il
-- serve. admin_force_resolve_order est neuve du jour meme.
--
-- LE DEFAUT. post_transfer ne controle que le solde GLOBAL du portefeuille de
-- sequestre — toutes les commandes y sont melangees. La branche REMBOURSEMENT
-- verifiait bien, elle, que le sequestre detient la somme de CETTE commande
-- (garde escrow_mismatch dans refund_order_to_buyer). La branche LIBERATION ne
-- verifiait rien.
--
-- CE QUE CA OUVRAIT. Un administrateur liberant une commande dont le sequestre
-- ne detient plus rien aurait paye son vendeur avec l'argent d'une AUTRE
-- commande — post_transfer aurait accepte, le portefeuille global etant
-- approvisionne. Le trou n'aurait ete visible qu'au moment ou la commande
-- victime aurait reclame son du, c'est-a-dire des semaines plus tard et sans
-- lien evident avec le geste qui l'a cause.
--
-- POURQUOI C'EST PRECISEMENT ICI QUE CA COMPTE. Ce levier ne sert pas au cours
-- normal : il sert aux commandes que le balayage nocturne ECARTE, et l'une des
-- raisons d'ecartement est justement « solde sequestre incoherent ». Le seul
-- outil concu pour traiter les comptes qui ne tombent pas juste etait le seul a
-- ne pas les verifier.
--
-- LE CORRECTIF. Une seule garde ajoutee, copiee sur celle du remboursement, et
-- le message d'erreur est deja traduit par la fonction edge
-- (escrow_mismatch -> 409 avec « verification comptable requise »). Le corps
-- DEPLOYE est repris tel quel : rien d'autre ne bouge.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne touche pas a resolve_dispute ni
-- aux autres chemins de liberation, qui presentent la meme asymetrie depuis
-- toujours. Eux servent au cours normal, sur des commandes dont les comptes
-- tombent juste ; et rouvrir trois fonctions qui portent de l'argent pour un
-- risque theorique se paie plus cher que le risque. A traiter separement, en
-- connaissance de cause.

CREATE OR REPLACE FUNCTION public.admin_force_resolve_order(p_order_id uuid, p_admin_id uuid, p_outcome text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order              record;
  v_before             jsonb;
  v_after              jsonb;
  v_escrow_wallet      uuid;
  v_seller_wallet      uuid;
  v_platform_wallet    uuid;
  v_now                timestamptz := now();
  v_held               bigint;
begin
  perform public.assert_admin(p_admin_id);

  if p_outcome not in ('refund', 'release') then
    raise exception 'invalid_outcome'
      using errcode = '22023', detail = 'attendu refund ou release';
  end if;

  if coalesce(nullif(btrim(p_reason), ''), '') = '' then
    -- Un motif est exige : c'est un geste hors du cours normal, il doit rester
    -- explicable des mois plus tard a qui relit admin_actions.
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select id, reference, buyer_id, seller_id, amount_minor, fees_minor,
         delivery_fee_minor, total_minor, status, events
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  -- Meme garde d'auto-traitement que resolve_dispute : un administrateur ne
  -- tranche pas une affaire ou il est partie.
  if p_admin_id = v_order.buyer_id or p_admin_id = v_order.seller_id then
    raise exception 'self_deal_forbidden' using errcode = 'P0001';
  end if;

  if v_order.status = 'disputed' then
    raise exception 'use_resolve_dispute'
      using errcode = '22023',
            detail = 'commande en litige : passer par resolve_dispute';
  end if;

  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'invalid_status'
      using errcode = '22023',
            detail = 'deblocable depuis paid/preparing/delivered, recu ' || v_order.status;
  end if;

  select to_jsonb(o.*) into v_before from public.orders o where o.id = p_order_id;

  if p_outcome = 'refund' then
    -- Meme chemin que le balayage automatique, a un detail pres :
    -- auto_refunded_at reste nul. Ce compteur mesure les remboursements
    -- OBTENUS PAR LE SILENCE ; un geste d'administrateur n'en est pas un et ne
    -- doit pas rapprocher l'acheteur de la revue manuelle.
    perform public.refund_order_to_buyer(
      p_order_id,
      'Remboursement décidé par un administrateur',
      'admin_force_refund',
      false
    );
  else
    select id into v_escrow_wallet
      from public.wallets
     where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

    select id into v_platform_wallet
      from public.wallets
     where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

    insert into public.wallets (user_id, currency)
      values (v_order.seller_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_seller_wallet
      from public.wallets
     where user_id = v_order.seller_id and currency = 'GNF';

    -- Le sequestre detient-il REELLEMENT l'argent de CETTE commande ?
    --
    -- post_transfer ne verifie que le solde GLOBAL du portefeuille de
    -- sequestre, ou toutes les commandes sont melangees. Sans ce controle, une
    -- liberation sur une commande dont le sequestre est vide paierait son
    -- vendeur avec l'argent d'une AUTRE commande, et le trou n'apparaitrait
    -- qu'au moment ou la victime reclamerait le sien.
    --
    -- C'est le pire endroit possible pour l'oublier : ce levier sert justement
    -- aux commandes anormales — celles que le balayage nocturne refuse de
    -- toucher PARCE QUE leurs comptes ne tombent pas juste.
    --
    -- La branche remboursement avait deja cette garde (dans
    -- refund_order_to_buyer) ; la branche liberation ne l'avait pas. Les deux
    -- sorties d'argent sont maintenant symetriques.
    v_held := public.order_escrow_balance(p_order_id);
    if v_held <> v_order.total_minor then
      raise exception 'escrow_mismatch'
        using errcode = 'P0001',
              detail = 'sequestre ' || v_held || ' pour un total de ' || v_order.total_minor;
    end if;

    perform public.post_transfer(
      v_escrow_wallet, v_seller_wallet, v_order.amount_minor,
      'order_release', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet, v_platform_wallet,
      v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
      'order_platform_fee', v_order.id
    );

    update public.orders
       set status = 'released',
           events = v_order.events || jsonb_build_array(jsonb_build_object(
             'at', v_now,
             'label', 'Fonds libérés par un administrateur',
             'kind', 'admin_force_release',
             'admin_id', p_admin_id,
             'reason', p_reason)),
           updated_at = v_now
     where id = p_order_id;

    insert into public.notifications
      (user_id, category, title, body, icon_hint, deeplink, ref_type, ref_id, app)
    values
      (v_order.seller_id, 'order', 'Fonds libérés',
       'Le montant de la commande ' || v_order.reference || ' a été versé sur ton solde Linky.',
       'check', '/seller/orders/' || v_order.id::text, 'order', v_order.id, 'marketplace'),
      (v_order.buyer_id, 'order', 'Commande clôturée',
       'La commande ' || v_order.reference || ' a été clôturée par le support Linky.',
       'info', '/order/' || v_order.id::text, 'order', v_order.id, 'marketplace');
  end if;

  select to_jsonb(o.*) into v_after from public.orders o where o.id = p_order_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id, 'order', p_order_id, 'order.force_resolve', p_reason,
    jsonb_build_object('outcome', p_outcome, 'from_status', v_order.status),
    v_before, v_after
  );
end;
$function$;

-- Supabase peut reaccorder EXECUTE a tout le monde a chaque CREATE OR REPLACE.
-- Sur CETTE fonction, l'oublier laisserait n'importe quel utilisateur connecte
-- liberer ou rembourser la commande de son choix. La signature est LUE dans le
-- catalogue : mal recopiee, elle ferait echouer toute la migration et donc
-- annulerait aussi le correctif qu'elle accompagne.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'admin_force_resolve_order'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $grants$;
