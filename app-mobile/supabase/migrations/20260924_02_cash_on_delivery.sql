-- PAYER A LA LIVRAISON (especes).
--
-- Demande du client, 2026-09-24 : « Cote client, il faut ajouter l'option
-- "Payer a la livraison" lorsqu'il choisit l'option livraison a domicile ».
--
-- ┌─ CE QUE CA CHANGE, ET POURQUOI CE N'EST PAS UN MOYEN DE PAIEMENT DE PLUS ─┐
-- Tout le produit repose sur une hypothese : l'argent entre en SEQUESTRE au
-- moment de la commande, et n'en sort qu'a la confirmation de reception. En
-- especes, rien n'entre. L'argent passe de la main de l'acheteur a celle du
-- livreur, devant la porte, sans jamais toucher Linky.
--
-- LE DANGER PRECIS, ET IL EST GRAVE. Le sequestre est un portefeuille POOLE :
-- il contient l'argent de TOUTES les commandes en cours. confirm_order_receipt
-- libere en faisant `post_transfer(sequestre -> vendeur)`. Si une commande
-- payee en especes y passait, post_transfer trouverait un solde — celui des
-- AUTRES acheteurs — et le virerait. La commande serait « liberee » avec
-- l'argent de quelqu'un d'autre, et le trou ne se verrait qu'au moment ou un
-- vrai remboursement echouerait faute de fonds. Meme chose pour
-- expire_stale_escrows, qui rembourse depuis le meme pot.
--
-- Ces deux portes sont donc fermees ici, et les especes recoivent leur propre
-- chemin de cloture : memes controles (acheteur, statut, QR), AUCUN mouvement
-- au grand livre. L'argent a change de main physiquement ; le grand livre n'a
-- rien a enregistrer, et surtout rien a inventer.
--
-- CE QUE LINKY NE PERCOIT PAS. Sur une commande en especes, ni la commission
-- ni les 15 000 GNF de frais de livraison n'entrent : ils sont encaisses par le
-- livreur avec le reste, et leur reversement se regle hors application. C'est
-- une consequence directe du mode de paiement, pas un oubli — a dire au client.
--
-- CE QUI N'A PAS EU BESOIN DE CHANGER. place_order cree deja les commandes des
-- rails externes en 'placed', sans aucun mouvement de fonds, en attendant le
-- cron ou le webhook. Une commande en especes a exactement cette forme : elle
-- emprunte donc la branche existante telle quelle. Et aucun balayage n'annule
-- les commandes 'placed' impayees (verifie sur cron.job en production), donc
-- rien ne viendra la tuer avant sa livraison.

-- ============================================================================
-- 1. LE MOYEN DE PAIEMENT, ET SA CONDITION.
--
-- 'cod' n'a de sens QUE pour une livraison a domicile : il n'y a personne pour
-- encaisser un retrait en boutique, et le client l'a demande explicitement pour
-- ce cas-la. La contrainte le dit en base, pas seulement a l'ecran.
do $mig$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%mtn-money%';
  if v_con is not null then
    execute format('alter table public.orders drop constraint %I', v_con);
  end if;
  alter table public.orders
    add constraint orders_payment_method_check
    check (payment_method = any (array[
      'orange-money', 'mtn-money', 'card', 'wallet', 'kulu',
      'soutramoney', 'lengopay-card', 'paycard', 'cod'
    ]));
end
$mig$;

alter table public.orders drop constraint if exists orders_cod_requires_delivery;
alter table public.orders
  add constraint orders_cod_requires_delivery
  check (payment_method <> 'cod' or delivery_mode = 'delivery');

-- ============================================================================
-- 2. LA PORTE DU SEQUESTRE SE FERME AUX ESPECES.
--
-- Patch chirurgical sur la definition en vigueur plutot que recopie : cette
-- fonction porte le verrou QR et la garde de statut, et les reecrire de memoire
-- reviendrait a risquer d'en perdre un.
do $mig$
declare
  v_src text;
  v_anchor text := 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;';
  v_guard  text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'confirm_order_receipt';
  if v_src is null then raise exception 'confirm_order_receipt introuvable'; end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'confirm_order_receipt : ancre introuvable, migration a revoir';
  end if;

  v_guard := v_anchor || '
  -- ESPECES : cette fonction vire depuis le sequestre POOLE. Une commande qui
  -- n''y a jamais rien depose prendrait l''argent des autres acheteurs.
  -- La cloture des especes passe par confirm_cod_order_receipt.
  if (select payment_method from public.orders where id = p_order_id) = ''cod'' then
    raise exception ''COD_ORDER'';
  end if;';

  execute replace(v_src, v_anchor, v_guard);
end
$mig$;

-- ============================================================================
-- 3. LE REMBOURSEMENT AUTOMATIQUE IGNORE LES ESPECES.
--
-- Meme pot, meme danger : rembourser une commande en especes prendrait l'argent
-- des autres. Et il n'y a rien a rendre — l'acheteur n'a rien verse.
do $mig$
declare
  v_src text;
  v_anchor text := 'where o.status in (''paid'', ''preparing'')';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'expire_stale_escrows';
  if v_src is null then raise exception 'expire_stale_escrows introuvable'; end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'expire_stale_escrows : ancre introuvable, migration a revoir';
  end if;
  execute replace(v_src, v_anchor,
    v_anchor || ' and o.payment_method <> ''cod''');
end
$mig$;

-- ============================================================================
-- 4. LA CLOTURE D'UNE COMMANDE PAYEE EN ESPECES.
--
-- Copie conforme de confirm_order_receipt pour les CONTROLES — c'est le meme
-- geste de confiance, il merite le meme verrou QR — et vide de tout mouvement
-- au grand livre. On n'ecrit pas une ligne comptable pour de l'argent qui n'a
-- jamais transite par nous : l'inventer rendrait les soldes faux.
create or replace function public.confirm_cod_order_receipt(
  p_order_id   uuid,
  p_caller_id  uuid,
  p_scan_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order record;
  v_now   timestamptz := now();
begin
  select id, buyer_id, status, events, scan_token, payment_method
    into v_order
    from public.orders
   where id = p_order_id
     for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.payment_method <> 'cod' then
    -- L'inverse de la garde posee plus haut : une commande payee en ligne doit
    -- passer par la liberation du sequestre, sinon son argent y resterait
    -- bloque pour toujours.
    raise exception 'NOT_COD_ORDER';
  end if;
  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;
  if v_order.status not in ('placed', 'paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;
  -- Meme verrou QR, et pour la meme raison : la confirmation vaut quittance.
  if v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;

  update public.orders
     set status = 'released',
         events = v_order.events || jsonb_build_array(
                    jsonb_build_object('at', v_now, 'label', 'Réception confirmée — payé en espèces à la livraison')
                  ),
         updated_at = v_now
   where id = v_order.id;
end;
$fn$;

-- Durcissement 2026-07-29.
revoke all on function public.confirm_cod_order_receipt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_cod_order_receipt(uuid, uuid, uuid) to service_role;
revoke all on function public.confirm_order_receipt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_order_receipt(uuid, uuid, uuid) to service_role;
revoke all on function public.expire_stale_escrows() from public, anon, authenticated;
grant execute on function public.expire_stale_escrows() to service_role;
