-- Liberation automatique du sequestre — la machinerie, LIVREE ETEINTE.
--
-- LE PROBLEME. Aujourd'hui, l'argent d'une commande payee ne sort du sequestre
-- que si quelqu'un agit : l'acheteur confirme, le livreur remet, ou un admin
-- tranche un litige. Si l'acheteur se tait — il a demenage, change de numero,
-- ou simplement oublie — l'argent reste bloque POUR TOUJOURS. Personne, pas
-- meme un administrateur, ne dispose d'un levier : resolve_dispute exige le
-- statut 'disputed', et rien ne permet de passer une commande en litige a la
-- place de l'acheteur. Trois commandes sont dans cet etat au jour d'ecriture.
--
-- LA REGLE RETENUE, ET POURQUOI ELLE VA DANS CE SENS. Passe le delai, on
-- REMBOURSE L'ACHETEUR — on ne paie jamais le vendeur automatiquement.
--
-- L'inverse (liberer vers le vendeur, comme le font la plupart des places de
-- marche) parait plus naturel et il est plus dangereux ici : le silence de
-- l'acheteur n'est PAS une preuve de reception. En Guinee, sur un reseau
-- irregulier, avec une application neuve, le silence signifie le plus souvent
-- « je n'ai rien recu et je ne sais pas quoi faire ». Payer le vendeur dans ce
-- cas, c'est transformer chaque non-livraison en vente reussie et faire porter
-- la perte a l'acheteur — exactement ce que le sequestre existe pour empecher.
-- Rembourser a tort coute une vente au vendeur, qui peut la refaire ; liberer a
-- tort coute la marchandise ET l'argent a l'acheteur, qui ne revient pas.
--
-- L'ANCRE DE TEMPS EST LE GRAND LIVRE, PAS LA COMMANDE. Le delai part de
-- ledger_entries.created_at de l'ecriture 'order_escrow' — l'instant ou l'argent
-- est reellement entre au sequestre. C'est le seul horodatage qu'aucune des deux
-- parties ne peut deplacer : orders.updated_at bouge a chaque changement de
-- statut, donc un vendeur qui passe sa commande de 'paid' a 'preparing' toutes
-- les six semaines repousserait l'echeance indefiniment.
--
-- CONSEQUENCE HEUREUSE : aucune colonne d'echeance a estampiller, donc AUCUNE
-- des trois fonctions qui portent l'argent (place_order, process_intent_outcome,
-- process_batch_intent_outcome) n'est modifiee par cette migration. C'est
-- delibere : la migration 20260730_01 n'avait ete appliquee qu'a moitie sur ces
-- fonctions-la et le frais de livraison est reste bloque au sequestre pendant
-- cinq semaines sans que personne le voie (corrige le 2026-09-07 par
-- 20260907_05). On ne les rouvre pas pour une fonctionnalite qui peut s'en
-- passer. Bonus : les commandes deja bloquees sont couvertes sans rattrapage.
--
-- DEUX VERROUS AVANT QUE QUOI QUE CE SOIT BOUGE. Le balayage ne rembourse rien
-- tant que les DEUX conditions ne sont pas reunies :
--   1. escrow_auto_refund_enabled = true
--   2. escrow_auto_refund_active_from = une date
-- Le second existe parce que le premier ne suffit pas : activer le drapeau seul
-- rembourserait a la seconde meme les commandes bloquees depuis aout, dont les
-- acheteurs n'ont jamais ete prevenus qu'un tel delai existait. On ne peut pas
-- appliquer retroactivement une regle que personne ne connaissait. La date
-- d'activation dit « a partir d'ici, les acheteurs sont informes ».
--
-- >>> A FAIRE AVANT D'ACTIVER : les CGU doivent enoncer le delai de 7 jours et
-- >>> le remboursement automatique. Sans ca, la regle est opposable a personne.
--
-- Livree eteinte, le balayage tourne quand meme chaque nuit et se contente de
-- RENDRE COMPTE : appeler select public.expire_stale_escrows() affiche ce qui
-- serait rembourse, ce qui serait ecarte et pourquoi. On lit le rapport pendant
-- quelques semaines avant d'allumer.

-- ---------------------------------------------------------------------------
-- 1. Reglages
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Aucune politique RLS : la table n'est donc lisible que par service_role, qui
-- passe outre. Les reglages de plateforme n'ont rien a faire dans le telephone
-- d'un utilisateur.
alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value, description) values
  ('escrow_auto_refund_enabled', 'false'::jsonb,
   'Verrou principal. false = le balayage se contente de rendre compte.'),
  ('escrow_auto_refund_active_from', 'null'::jsonb,
   'Second verrou. Seules les commandes dont le sequestre a ete credite APRES cet instant sont eligibles. null = aucune. A poser le jour ou les CGU annoncent la regle.'),
  ('escrow_auto_refund_days', '7'::jsonb,
   'Jours entre l''entree au sequestre et le remboursement automatique.'),
  ('escrow_notice_1_days', '3'::jsonb,
   'Premier rappel a l''acheteur et au vendeur, en jours depuis l''entree au sequestre.'),
  ('escrow_notice_2_days', '6'::jsonb,
   'Second rappel, la veille de l''echeance.'),
  ('escrow_auto_refund_max_minor', '5000000'::jsonb,
   'Plafond en GNF. Au-dessus, un humain tranche : une erreur sur une grosse somme coute trop cher pour etre automatisee.'),
  ('escrow_auto_refund_max_per_buyer', '2'::jsonb,
   'Au-dela de ce nombre de remboursements automatiques deja obtenus, l''acheteur passe en revue manuelle. Empeche d''en faire une methode : commander, se taire, etre rembourse, garder la marchandise.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Marqueurs sur la commande
-- ---------------------------------------------------------------------------
--
-- Trois horodatages seulement, et aucune echeance : l'echeance se deduit du
-- grand livre (voir l'en-tete). Ceux-ci enregistrent ce qui a DEJA ete fait,
-- pour ne pas le refaire — un rappel envoye deux fois use la confiance aussi
-- surement qu'un rappel jamais envoye.

alter table public.orders
  add column if not exists escrow_notice_1_at timestamptz,
  add column if not exists escrow_notice_2_at timestamptz,
  add column if not exists auto_refunded_at   timestamptz;

comment on column public.orders.auto_refunded_at is
  'Non nul = remboursee par le balayage automatique, jamais par un humain. Sert aussi a compter les recidives par acheteur.';

-- Le balayage ne regarde que les commandes vivantes et jamais remboursees.
-- Index partiel : il reste minuscule meme quand la table grossit, parce que la
-- grande majorite des commandes finit hors de ces deux statuts.
create index if not exists orders_escrow_sweep_idx
  on public.orders (status)
  where status in ('paid', 'preparing') and auto_refunded_at is null;

-- ---------------------------------------------------------------------------
-- 3. Lectures
-- ---------------------------------------------------------------------------

create or replace function public.platform_setting(p_key text, p_default jsonb)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((select s.value from public.platform_settings s where s.key = p_key), p_default);
$$;

-- Ce que le sequestre detient REELLEMENT pour cette commande, recalcule depuis
-- les ecritures. Pas orders.total_minor : c'est ce que l'acheteur DEVAIT payer.
-- Les deux doivent coincider ; quand ils divergent, quelque chose s'est mal
-- passe et le balayage refuse de toucher a l'argent (voir la garde 5).
create or replace function public.order_escrow_balance(p_order_id uuid)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(sum(
           case when le.direction = 'credit' then le.amount_minor else -le.amount_minor end
         ), 0)::bigint
    from public.ledger_entries le
    join public.wallets w on w.id = le.wallet_id
   where le.ref_id = p_order_id
     and w.user_id = '00000000-0000-0000-0000-000000000001';
$$;

-- L'instant ou l'argent est entre au sequestre. Null = il n'y est jamais entre
-- (commande 'placed' jamais payee) : rien a rembourser, rien a balayer.
create or replace function public.order_escrow_at(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $$
  select min(le.created_at)
    from public.ledger_entries le
   where le.ref_type = 'order_escrow'
     and le.direction = 'credit'
     and le.ref_id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Restitution du stock
-- ---------------------------------------------------------------------------
--
-- Le declencheur existant (trg_restore_stock_on_order_cancel) ne se declenche
-- que sur placed -> cancelled. Un remboursement va de paid/preparing ->
-- refunded : il ne passe jamais dessus. Sans cette fonction, chaque
-- remboursement automatique retirerait un article du stock du vendeur pour
-- toujours. Meme corps que le declencheur, y compris le filtre stock non nul :
-- un stock non declare n'avait pas ete decremente, donc il n'y a rien a rendre
-- — sinon on inventerait de la marchandise.
create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.products p
    set stock = p.stock + agg.qty,
        updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.product_id
    ) agg
   where p.id = agg.product_id
     and p.stock is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Le remboursement lui-meme
-- ---------------------------------------------------------------------------
--
-- Un SEUL endroit deplace l'argent vers l'acheteur, appele aussi bien par le
-- balayage automatique que par le levier administrateur. La lecon de
-- 20260907_05 est fraiche : quatre chemins de sortie ecrits separement, trois
-- avaient oublie le meme champ pendant cinq semaines.
--
-- Les montants recopient exactement la branche 'refund' de resolve_dispute :
-- l'acheteur recupere le prix ET les frais, service comme livraison. Il a paye
-- une livraison qui n'a pas eu lieu.
create or replace function public.refund_order_to_buyer(
  p_order_id  uuid,
  p_label     text,
  p_kind      text,
  p_automatic boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order          record;
  v_escrow_wallet  uuid;
  v_buyer_wallet   uuid;
  v_held           bigint;
  v_now            timestamptz := now();
begin
  select id, reference, buyer_id, seller_id, amount_minor, fees_minor,
         delivery_fee_minor, total_minor, status, events
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'invalid_status'
      using errcode = '22023',
            detail = 'remboursable depuis paid/preparing/delivered, recu ' || v_order.status;
  end if;

  -- Le solde est REVERIFIE ici, sous le verrou de ligne, meme quand l'appelant
  -- l'a deja verifie. Entre sa lecture et ce point, une confirmation d'achat
  -- concurrente a pu vider le sequestre ; sans cette relecture on tenterait un
  -- transfert a decouvert. post_transfer leverait INSUFFICIENT_FUNDS et on
  -- aurait raison, mais avec un message que personne ne saurait interpreter.
  v_held := public.order_escrow_balance(p_order_id);
  if v_held <> v_order.total_minor then
    raise exception 'escrow_mismatch'
      using errcode = 'P0001',
            detail = 'sequestre ' || v_held || ' pour un total de ' || v_order.total_minor;
  end if;

  select id into v_escrow_wallet
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  insert into public.wallets (user_id, currency)
    values (v_order.buyer_id, 'GNF')
    on conflict (user_id, currency) do nothing;

  select id into v_buyer_wallet
    from public.wallets
   where user_id = v_order.buyer_id and currency = 'GNF';

  perform public.post_transfer(
    v_escrow_wallet, v_buyer_wallet, v_order.amount_minor,
    'order_refund', v_order.id
  );
  perform public.post_transfer(
    v_escrow_wallet, v_buyer_wallet,
    v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
    'order_fee_refund', v_order.id
  );

  perform public.restore_order_stock(v_order.id);

  update public.orders
     set status = 'refunded',
         events = v_order.events || jsonb_build_array(jsonb_build_object(
           'at', v_now, 'label', p_label, 'kind', p_kind)),
         auto_refunded_at = case when p_automatic then v_now else auto_refunded_at end,
         updated_at = v_now
   where id = v_order.id;

  -- Une livraison encore ouverte sur une commande morte enverrait un livreur
  -- chercher un colis que plus personne n'attend.
  update public.deliveries
     set status = 'cancelled',
         updated_at = v_now
   where order_id = v_order.id
     and status in ('unassigned', 'assigned');

  -- Les deux parties sont prevenues, pas seulement celle qui y gagne. Un
  -- vendeur qui voit disparaitre une commande sans explication ouvre un litige
  -- ou appelle — les deux couteux.
  --
  -- Ecriture directe dans notifications : pg_cron ne peut pas appeler la
  -- fonction edge qui pousse aussi sur les telephones, donc ces avis
  -- apparaissent dans la boite de reception de l'application mais ne
  -- declenchent PAS de notification systeme. Sans consequence aujourd'hui, la
  -- pousse etant de toute facon inerte faute de cles APNS/FCM cote client.
  insert into public.notifications
    (user_id, category, title, body, icon_hint, deeplink, ref_type, ref_id, app)
  values
    (v_order.buyer_id, 'order', 'Commande remboursée',
     'La commande ' || v_order.reference || ' a été remboursée. Le montant est de retour sur ton solde Linky.',
     'shield', '/order/' || v_order.id::text, 'order', v_order.id, 'marketplace'),
    (v_order.seller_id, 'order', 'Commande remboursée',
     'La commande ' || v_order.reference || ' a été remboursée à l''acheteur. Le stock a été remis en ligne.',
     'info', '/seller/orders/' || v_order.id::text, 'order', v_order.id, 'marketplace');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Le balayage
-- ---------------------------------------------------------------------------
--
-- Rend un rapport jsonb plutot que void : eteint, le rapport EST le produit.
-- Chaque commande examinee y figure avec sa decision et, si elle est ecartee,
-- la raison. C'est ce qu'on lit pendant les semaines qui precedent l'activation
-- pour savoir si la regle se comporte comme prevu — et c'est aussi la seule
-- facon de decouvrir un cas de figure que cette migration n'a pas anticipe.
create or replace function public.expire_stale_escrows()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_enabled       boolean;
  v_active_from   timestamptz;
  v_days          int;
  v_n1_days       int;
  v_n2_days       int;
  v_max_minor     bigint;
  v_max_per_buyer int;
  v_now           timestamptz := now();
  r               record;
  v_deadline      timestamptz;
  v_skip          text;
  v_held          bigint;
  v_prior         int;
  v_lines         jsonb := '[]'::jsonb;
  v_refunded      int := 0;
  v_notices       int := 0;
  v_would         int := 0;
  v_seen          int := 0;
begin
  v_enabled       := coalesce((public.platform_setting('escrow_auto_refund_enabled', 'false'::jsonb) #>> '{}')::boolean, false);
  v_active_from   := (public.platform_setting('escrow_auto_refund_active_from', 'null'::jsonb) #>> '{}')::timestamptz;
  v_days          := coalesce((public.platform_setting('escrow_auto_refund_days', '7'::jsonb) #>> '{}')::int, 7);
  v_n1_days       := coalesce((public.platform_setting('escrow_notice_1_days', '3'::jsonb) #>> '{}')::int, 3);
  v_n2_days       := coalesce((public.platform_setting('escrow_notice_2_days', '6'::jsonb) #>> '{}')::int, 6);
  v_max_minor     := coalesce((public.platform_setting('escrow_auto_refund_max_minor', '5000000'::jsonb) #>> '{}')::bigint, 5000000);
  v_max_per_buyer := coalesce((public.platform_setting('escrow_auto_refund_max_per_buyer', '2'::jsonb) #>> '{}')::int, 2);

  for r in
    select o.id, o.reference, o.buyer_id, o.seller_id, o.status, o.total_minor,
           o.escrow_notice_1_at, o.escrow_notice_2_at,
           public.order_escrow_at(o.id) as escrow_at,
           (select d.status from public.deliveries d where d.order_id = o.id limit 1) as delivery_status
      from public.orders o
     where o.status in ('paid', 'preparing')
       and o.auto_refunded_at is null
     order by o.created_at asc
  loop
    v_seen := v_seen + 1;

    -- Argent jamais entre au sequestre : hors sujet, et surtout aucune ancre de
    -- temps sur laquelle compter.
    if r.escrow_at is null then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'commande', r.reference, 'decision', 'ignoree', 'raison', 'aucune entree au sequestre'));
      continue;
    end if;

    v_deadline := r.escrow_at + make_interval(days => v_days);
    v_skip := null;

    -- Les gardes, de la moins couteuse a la plus couteuse. Chacune ecarte une
    -- facon differente de se tromper ; l'ordre n'a d'autre importance que le
    -- prix de la lecture.
    if v_active_from is null or r.escrow_at < v_active_from then
      -- Regle non opposable a cette commande : son acheteur n'en a jamais ete
      -- informe. C'est le verrou qui empeche une activation de vider le
      -- sequestre d'un coup.
      v_skip := 'anterieure a l''activation';
    elsif r.delivery_status in ('in_transit', 'delivered', 'failed') then
      -- Un livreur est parti, ou revenu bredouille. Dans les deux cas la
      -- marchandise a bouge et le silence de l'acheteur ne veut plus dire
      -- « rien recu ». Un humain regarde.
      v_skip := 'livraison engagee (' || r.delivery_status || ')';
    elsif r.total_minor > v_max_minor then
      v_skip := 'montant au-dessus du plafond';
    else
      select count(*) into v_prior
        from public.orders o2
       where o2.buyer_id = r.buyer_id
         and o2.auto_refunded_at is not null;
      if v_prior >= v_max_per_buyer then
        v_skip := 'acheteur deja rembourse ' || v_prior || ' fois';
      else
        v_held := public.order_escrow_balance(r.id);
        if v_held <> r.total_minor then
          -- Les comptes ne tombent pas juste. On ne devine pas avec de
          -- l'argent : la commande sort du balayage et attend un humain.
          v_skip := 'solde sequestre ' || v_held || ' pour un total de ' || r.total_minor;
        end if;
      end if;
    end if;

    if v_skip is not null then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'commande', r.reference, 'decision', 'ecartee', 'raison', v_skip,
        'echeance', v_deadline));
      continue;
    end if;

    -- Echeance pas encore atteinte : reste les rappels.
    if v_now < v_deadline then
      if not v_enabled then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'commande', r.reference, 'decision', 'en cours', 'echeance', v_deadline));
        continue;
      end if;

      -- Les rappels ne partent QUE si la fonctionnalite est allumee. Eteinte,
      -- ils annonceraient un remboursement qui n'arrivera pas.
      if r.escrow_notice_1_at is null and v_now >= r.escrow_at + make_interval(days => v_n1_days) then
        insert into public.notifications
          (user_id, category, title, body, icon_hint, deeplink, ref_type, ref_id, app)
        values
          (r.buyer_id, 'order', 'As-tu reçu ta commande ?',
           'Confirme la réception de ' || r.reference || '. Sans confirmation, elle sera remboursée automatiquement.',
           'shield', '/order/' || r.id::text, 'order', r.id, 'marketplace'),
          (r.seller_id, 'order', 'Commande en attente de confirmation',
           'L''acheteur n''a pas encore confirmé ' || r.reference || '. Sans confirmation, elle sera remboursée.',
           'info', '/seller/orders/' || r.id::text, 'order', r.id, 'marketplace');
        update public.orders set escrow_notice_1_at = v_now where id = r.id;
        v_notices := v_notices + 1;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'commande', r.reference, 'decision', 'premier rappel envoye', 'echeance', v_deadline));
      elsif r.escrow_notice_2_at is null and v_now >= r.escrow_at + make_interval(days => v_n2_days) then
        insert into public.notifications
          (user_id, category, title, body, icon_hint, deeplink, ref_type, ref_id, app)
        values
          (r.buyer_id, 'order', 'Dernier rappel',
           'La commande ' || r.reference || ' sera remboursée demain si tu ne confirmes pas la réception.',
           'shield', '/order/' || r.id::text, 'order', r.id, 'marketplace'),
          (r.seller_id, 'order', 'Dernier rappel',
           'La commande ' || r.reference || ' sera remboursée demain faute de confirmation.',
           'info', '/seller/orders/' || r.id::text, 'order', r.id, 'marketplace');
        update public.orders set escrow_notice_2_at = v_now where id = r.id;
        v_notices := v_notices + 1;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'commande', r.reference, 'decision', 'dernier rappel envoye', 'echeance', v_deadline));
      else
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'commande', r.reference, 'decision', 'en cours', 'echeance', v_deadline));
      end if;
      continue;
    end if;

    -- Echeance depassee et toutes les gardes franchies.
    if not v_enabled then
      v_would := v_would + 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'commande', r.reference, 'decision', 'SERAIT REMBOURSEE',
        'montant', r.total_minor, 'echeance', v_deadline));
      continue;
    end if;

    -- Chaque remboursement dans son propre bloc : une commande qui echoue ne
    -- doit pas emporter le balayage entier. Sans ce filet, une seule ligne
    -- abimee gelerait toutes les autres, chaque nuit, sans bruit.
    begin
      perform public.refund_order_to_buyer(
        r.id,
        'Remboursement automatique — réception non confirmée',
        'auto_refund',
        true
      );
      v_refunded := v_refunded + 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'commande', r.reference, 'decision', 'remboursee', 'montant', r.total_minor));
    exception when others then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'commande', r.reference, 'decision', 'echec', 'erreur', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'a', v_now,
    'actif', v_enabled,
    'actif_depuis', v_active_from,
    'delai_jours', v_days,
    'examinees', v_seen,
    'remboursees', v_refunded,
    'rappels', v_notices,
    'seraient_remboursees', v_would,
    'detail', v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Le levier manuel
-- ---------------------------------------------------------------------------
--
-- Ce qui manque aujourd'hui : resolve_dispute exige le statut 'disputed', et
-- rien ne permet d'y mettre une commande a la place de l'acheteur. Une commande
-- bloquee dont l'acheteur se tait n'a donc AUCUNE issue, pour personne.
--
-- Cette fonction est cette issue. Elle sert aussi de recours a chaque cas que
-- le balayage ecarte volontairement : montant eleve, livraison engagee, solde
-- incoherent, acheteur recidiviste. Le balayage automatise le cas evident ;
-- celle-ci traite tout le reste — et c'est elle, pas le balayage, qui rend la
-- prudence du balayage acceptable.
--
-- Elle ne touche PAS aux commandes 'disputed' : celles-la passent par
-- resolve_dispute, qui porte le seuil des deux administrateurs au-dela de
-- 5 M GNF. Deux portes vers le meme argent, dont une sans ce seuil, le
-- contournerait.
create or replace function public.admin_force_resolve_order(
  p_order_id uuid,
  p_admin_id uuid,
  p_outcome  text,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order              record;
  v_before             jsonb;
  v_after              jsonb;
  v_escrow_wallet      uuid;
  v_seller_wallet      uuid;
  v_platform_wallet    uuid;
  v_now                timestamptz := now();
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
$$;

-- ---------------------------------------------------------------------------
-- 8. Le balayage nocturne
-- ---------------------------------------------------------------------------
--
-- Une fois par nuit, et NON greffe sur payment-intents-poll qui tourne toutes
-- les 5 secondes. Y accrocher un parcours de commandes le ferait tourner
-- 17 280 fois par jour pour un travail qui n'a de sens qu'une fois — et le
-- moindre ralentissement retarderait la detection des paiements, qui est la
-- seule chose que ce cron-la doit faire.
--
-- 4h37 : a l'ecart de linky-auth-cleanup (3h00) et linky-expire-bookings
-- (3h23), pour qu'un verrou pris par l'un n'attende jamais l'autre.
--
-- Le rapport rendu par la fonction est perdu par cron — c'est voulu : on le lit
-- en appelant select public.expire_stale_escrows() a la main, ce qui ne coute
-- rien tant que la fonctionnalite est eteinte (elle ne fait alors que lire).
do $cron$
begin
  perform cron.unschedule('linky-expire-escrows');
exception when others then
  null;  -- pas encore planifie
end $cron$;

select cron.schedule('linky-expire-escrows', '37 4 * * *', 'select public.expire_stale_escrows();');

-- ---------------------------------------------------------------------------
-- 9. Droits
-- ---------------------------------------------------------------------------
--
-- Supabase accorde EXECUTE a tout le monde par defaut sur chaque nouvelle
-- fonction. Sans ce bloc, n'importe quel utilisateur connecte pourrait appeler
-- refund_order_to_buyer sur la commande de son choix.
--
-- Les signatures sont LUES dans le catalogue plutot qu'ecrites a la main : une
-- seule mal recopiee ferait echouer toute la migration.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'platform_setting', 'order_escrow_balance', 'order_escrow_at',
         'restore_order_stock', 'refund_order_to_buyer',
         'expire_stale_escrows', 'admin_force_resolve_order'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $grants$;

revoke all on public.platform_settings from public, anon, authenticated;
grant select, insert, update, delete on public.platform_settings to service_role;
