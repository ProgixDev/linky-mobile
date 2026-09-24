-- LES TROIS AUTRES PORTES DU SEQUESTRE, FERMEES AUX ESPECES.
--
-- La migration 20260924_02 n'en avait ferme qu'UNE (confirm_order_receipt).
-- La cartographie d'impact lancee le meme jour en a trouve trois de plus, et
-- elle avait raison : il n'existe pas un chemin de liberation, il en existe
-- quatre, ecrits a des dates differentes, tous appelant post_transfer depuis
-- le portefeuille de sequestre.
--
-- RAPPEL DU DANGER. Le sequestre est POOLE : il porte l'argent de toutes les
-- commandes, reservations et boosts en cours. post_transfer ne verifie que son
-- solde GLOBAL — jamais ce que LA commande y a depose. Une commande payee en
-- especes n'y a rien depose ; le virement passerait quand meme, sur l'argent
-- des autres acheteurs, et le trou ne se verrait qu'au moment ou une victime
-- reclamerait son du. La migration 20260908_01 avait deja note cette asymetrie
-- et l'avait assumee, au motif que ces chemins « servent au cours normal, sur
-- des commandes dont les comptes tombent juste ». Les especes suppriment
-- exactement cette hypothese.
--
-- LE CHOIX : UNE SEULE PORTE DE CLOTURE POUR LES ESPECES, celle de l'acheteur
-- avec son QR (confirm_cod_order_receipt, 20260924_02). Les trois autres
-- refusent. Ce n'est pas seulement le plus sur, c'est le plus juste : quand
-- l'argent passe de la main a la main, la seule personne qui puisse attester
-- que la commande est soldee est celle qui a tendu les billets. Laisser le
-- vendeur ou le livreur clore une vente en especes reviendrait a leur laisser
-- signer une quittance a la place du payeur.
--
-- resolve_dispute refuse AUSSI, et pour une raison de plus : un litige
-- monetaire porte sur de l'argent que Linky detient. Sur une commande en
-- especes, Linky ne detient rien — ni a rembourser, ni a liberer. Le differend
-- se regle entre les parties, et l'equipe garde la main pour annuler la
-- commande sans mouvement de fonds.
--
-- NOTE DE FORME : trois blocs independants, et non une boucle sur une liste.
-- La version en boucle portait ses ancres dans un VALUES bourre de quotes
-- imbriquees, que l'API de gestion de Supabase rejette (400, corps vide).

-- ── 1. LA CONFIRMATION DU LIVREUR ───────────────────────────────────────────
do $m1$
declare
  v_src text;
  v_anchor text := 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;';
  v_guard text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'livreur_confirm_handoff' limit 1;
  if v_src is null then raise exception 'livreur_confirm_handoff introuvable'; end if;
  if position('COD_ORDER' in v_src) > 0 then return; end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'livreur_confirm_handoff : ancre introuvable';
  end if;

  v_guard := v_anchor || '
  -- ESPECES : ce chemin vire depuis le sequestre POOLE, ou cette commande n''a
  -- jamais rien depose. Il prendrait l''argent des autres acheteurs. La seule
  -- cloture valable est celle de l''acheteur avec son QR.
  if (select payment_method from public.orders where id = p_order_id) = ''cod'' then
    raise exception ''COD_ORDER'';
  end if;';

  execute replace(v_src, v_anchor, v_guard);
end
$m1$;

-- ── 2. LA CONFIRMATION DU VENDEUR (retrait en boutique) ─────────────────────
do $m2$
declare
  v_src text;
  v_anchor text := 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;';
  v_guard text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seller_confirm_pickup' limit 1;
  if v_src is null then raise exception 'seller_confirm_pickup introuvable'; end if;
  if position('COD_ORDER' in v_src) > 0 then return; end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'seller_confirm_pickup : ancre introuvable';
  end if;

  v_guard := v_anchor || '
  -- ESPECES : voir livreur_confirm_handoff. Meme pot, meme danger.
  if (select payment_method from public.orders where id = p_order_id) = ''cod'' then
    raise exception ''COD_ORDER'';
  end if;';

  execute replace(v_src, v_anchor, v_guard);
end
$m2$;

-- ── 3. LA RESOLUTION D'UN LITIGE ────────────────────────────────────────────
do $m3$
declare
  v_src text;
  v_anchor text := 'raise exception ''order_not_found'' using errcode = ''P0002'';';
  v_guard text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_dispute' limit 1;
  if v_src is null then raise exception 'resolve_dispute introuvable'; end if;
  if position('COD_ORDER' in v_src) > 0 then return; end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'resolve_dispute : ancre introuvable';
  end if;

  v_guard := v_anchor || '
  -- ESPECES : Linky ne detient rien sur cette commande, donc il n''y a ni
  -- remboursement ni liberation possible — seulement de l''argent qui
  -- appartient aux autres acheteurs.
  if (select payment_method from public.orders where id = p_order_id) = ''cod'' then
    raise exception ''COD_ORDER'';
  end if;';

  execute replace(v_src, v_anchor, v_guard);
end
$m3$;

-- Durcissement 2026-07-29 : un CREATE OR REPLACE via EXECUTE peut re-ouvrir
-- les droits par defaut.
do $g$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('livreur_confirm_handoff', 'seller_confirm_pickup', 'resolve_dispute')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$g$;
