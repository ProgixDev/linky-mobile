-- CONDITIONS DE LOCATION : CAUTION, SEJOUR MINIMUM, GRILLE DE PRIX PAR DUREE.
--
-- Demandes du client, 2026-09-26, ecran « Nouveau bien » :
--   « Une option "Caution / Garantie" a cocher qui active une liste deroulante
--     (Montant / Mois / %) puis zone de saisie [...] Prendre en compte cela dans
--     la partie finalisation de la reservation (Paiement). »
--   « Une option "Sejour minimum" en jour ou mois selon ce qui a ete selectionne
--     dans "Periode de location". Verouiller cela dans le calendrier. »
--   « Une option de reduction lorsque le locataire selectionne ... jours/mois.
--     J'ai pas d'idee sur la forme a mettre, je te laisse faire. »
--
-- ┌─ CE QUE CETTE MIGRATION NE FAIT PAS, ET POURQUOI ────────────────────────┐
-- Elle ne recree AUCUNE fonction. Ni release_booking, ni
-- create_property_with_photos, ni post_transfer.
--
-- Parce que les fichiers de ce depot sont PERIMES par rapport a la production :
-- 20260924_05 et _06 ont reecrit dix-sept corps EN PLACE, par chirurgie de
-- texte, pour la separation des caisses Vendeur/Immo. Un DROP + CREATE de
-- release_booking depuis 20260909_02 restaurerait la version d'avant les
-- caisses. C'est exactement ainsi que la garde de stock de place_order_multi a
-- disparu entre le 13 aout et le 8 septembre sans que personne ne le voie.
--
-- La caution reste donc DANS amount_minor : seule sa VENTILATION est
-- enregistree. Le bailleur touche toujours loyer + caution en un seul virement
-- a l'emmenagement, exactement comme aujourd'hui, et le grand livre ne bouge
-- pas d'un franc. Scinder le virement aurait en prime fait echouer TOUTES les
-- reservations sans caution : post_transfer leve INVALID_AMOUNT sur un montant
-- nul (20260923_03:55), et une location a la journee n'a pas de caution.
--
-- Les nouvelles colonnes de properties sont ecrites par property-create avec un
-- UPDATE de suivi, comme video_url depuis le 2026-07-26 : la liste de colonnes
-- de create_property_with_photos est figee (20260530_02:27) et une colonne
-- absente y serait SILENCIEUSEMENT perdue.
-- └──────────────────────────────────────────────────────────────────────────┘

-- ===========================================================================
-- 1. LES CONDITIONS, SUR L'ANNONCE
-- ===========================================================================
alter table public.properties
  add column if not exists deposit_basis text     null,
  add column if not exists deposit_value bigint   null,
  add column if not exists deposit_kind  text     null,
  add column if not exists min_nights    smallint null,
  add column if not exists min_months    smallint null;

comment on column public.properties.deposit_value is
  'GNF si basis=amount ; nombre de mois de loyer si basis=months ; POINTS DE BASE '
  'si basis=percent (1000 = 10 %). L''unite est dictee par deposit_basis, DANS LA '
  'MEME LIGNE. C''est la lecon de wallets(kind) : un nombre dont l''unite vit '
  'ailleurs finit par etre lu au hasard.';

comment on column public.properties.deposit_kind is
  'caution = restituable au locataire en fin de bail ; agency_fee = acquis a '
  'l''agence, jamais rendu. Le client a mis « 10 % de frais d''agence » et « 2 mois '
  'de caution » sous la MEME case a cocher : ce sont deux objets economiquement '
  'opposes. Sans ce mot, la clause en dur du contrat promettrait une restitution '
  'sur des frais d''agence.';

comment on column public.properties.min_nights is
  'Sejour minimum d''une annonce a la JOURNEE. Deux colonnes et non une seule '
  'interpretee par per_month : property-update laisse basculer per_month seul sur '
  'une location publiee, et « 3 nuits minimum » y deviendrait « 3 MOIS minimum » '
  'sans qu''une ligne de code mente. Celle qui ne correspond pas a la periode est '
  'simplement MUETTE — inerte plutot que reinterpretee.';

-- ── LA REPRISE DE L'EXISTANT, POINT LE PLUS DANGEREUX DU LOT ───────────────
-- Aujourd'hui la caution n'est pas un reglage : c'est une ligne de code, dans
-- booking-request — « deposit = period === 'month' && !held ? rent : 0 ».
-- Laisser les colonnes nulles la ferait disparaitre de TOUTES les annonces
-- mensuelles en ligne, en silence, et en faveur du locataire — donc personne ne
-- le signalerait. Cet UPDATE rend le comportement actuel explicite, au franc
-- pres, sans qu'aucun bailleur ait a toucher son annonce.
update public.properties
   set deposit_basis = 'months',
       deposit_value = 1,
       deposit_kind  = 'caution'
 where type = 'location'
   and per_month = true
   and deposit_basis is null;

alter table public.properties
  add constraint properties_deposit_basis_ck check (
    deposit_basis is null or deposit_basis in ('amount', 'months', 'percent')),
  add constraint properties_deposit_kind_ck check (
    deposit_kind is null or deposit_kind in ('caution', 'agency_fee')),
  -- Un demi-reglage n'existe pas : les trois, ou aucun.
  add constraint properties_deposit_triplet_ck check (
    num_nonnulls(deposit_basis, deposit_value, deposit_kind) in (0, 3)),
  add constraint properties_deposit_range_ck check (
    deposit_basis is null
    or (deposit_basis = 'amount'  and deposit_value between 1 and 1000000000000)
    or (deposit_basis = 'months'  and deposit_value between 1 and 12)
    -- points de base : 100 = 1 %, 5000 = 50 %.
    or (deposit_basis = 'percent' and deposit_value between 100 and 5000)),
  -- « 2 mois de caution » n'a aucun sens sur une annonce a la journee.
  add constraint properties_deposit_months_monthly_ck check (
    deposit_basis is distinct from 'months' or per_month),
  -- Les bornes hautes ne sont PAS cosmetiques : MAX_NIGHTS vaut 90 dans
  -- booking-request et bookings.months est borne a 36. Au-dela, l'annonce
  -- serait en ligne et simplement irreservable, sans que rien ne le dise au
  -- bailleur.
  add constraint properties_min_nights_ck check (
    min_nights is null or min_nights between 1 and 90),
  add constraint properties_min_months_ck check (
    min_months is null or min_months between 1 and 36),
  -- Une vente ou un terrain n'a ni caution ni sejour minimum.
  add constraint properties_terms_rental_only_ck check (
    type = 'location'
    or (deposit_basis is null and min_nights is null and min_months is null));

-- ===========================================================================
-- 2. LA GRILLE DE PRIX PAR DUREE
-- ===========================================================================
-- LA FORME RETENUE, en une phrase pour le bailleur : « Tu ne saisis aucune
-- remise. Tu donnes tes prix — la nuit, la semaine, le mois — et l'application
-- cherche pour ton locataire la combinaison la moins chere. »
--
-- C'est ainsi que le client raisonne lui-meme : son exemple dit « ils ont
-- baisse a 8 000 000 par mois », jamais un pourcentage. Et c'est la seule des
-- trois formes etudiees ou le moteur ne DIVISE jamais : tous les totaux sont
-- des sommes des entiers que le bailleur a tapes. Dans un projet ou un franc
-- d'ecart fait un contrat faux, c'est ce qui permet de se passer d'une regle
-- d'arrondi.
create table if not exists public.property_rates (
  property_id uuid     not null references public.properties(id) on delete cascade,
  -- L'UNITE EST PORTEE PAR LA LIGNE. Une bascule /jour <-> /mois rend l'ancienne
  -- grille INERTE au lieu de la faire relire dans la mauvaise unite : rien a
  -- effacer, et le bailleur qui essaie une periode ne perd pas sa saisie.
  kind        text     not null check (kind in ('block', 'tier')),
  units       smallint not null,
  price_minor bigint   not null check (price_minor > 0),
  primary key (property_id, kind, units),
  constraint property_rates_units_ck check (
    (kind = 'block' and units between 2 and 90)
    or (kind = 'tier' and units between 2 and 36))
);

comment on table public.property_rates is
  'Grille de prix par duree. kind=block (annonce au JOUR) : price_minor est le prix '
  'du BLOC de `units` nuits — 7 la semaine, 30 le mois. Le moteur EMPILE les blocs '
  'et retient le decoupage le moins cher qui COUVRE le sejour ; il ne divise '
  'jamais. kind=tier (annonce au MOIS) : price_minor est le loyer d''UN mois quand '
  'le bail dure au moins `units` mois — empiler n''y voudrait rien dire, puisque '
  'seul le premier mois transite par Linky. Le prix de l''unite simple n''est JAMAIS '
  'ici : il reste properties.price_minor, une seule source. ZERO LIGNE = tarif '
  'lineaire, soit exactement le comportement d''avant ce lot, au franc.';

alter table public.property_rates enable row level security;
-- Aucune policy : service_role seul, comme property_photos. Les invariants
-- CROISES (au plus quatre lignes, vocabulaire 7/14/30, coherence avec le prix de
-- base) vivent dans la fonction edge — ils dependent de plusieurs lignes et
-- doivent produire un message que le bailleur comprend. Ils ne sont pas
-- necessaires a la justesse : un bloc mal tarife n'est simplement jamais retenu
-- par le minimum du moteur.

create index if not exists property_rates_property_idx
  on public.property_rates (property_id);

-- ===========================================================================
-- 3. LA VUE — colonnes AJOUTEES EN FIN DE LISTE
-- ===========================================================================
-- « create or replace view » refuse de renommer ou reordonner une colonne
-- existante. Et `with (security_invoker = on)` doit etre RECONDUIT : l'omettre
-- remettrait la vue en security definer et deferait le durcissement du
-- 2026-07-29.
create or replace view public.properties_with_cover
  with (security_invoker = on)
as
  select
    p.id, p.owner_id, p.shop_id, p.type, p.title, p.description, p.price_minor,
    p.per_month, p.bedrooms, p.area_sqm, p.furnished, p.amenities, p.city,
    p.district, p.distance_to_road_m, p.lat, p.lng, p.video_url, p.status,
    p.view_count, p.fav_count, p.created_at, p.updated_at,
    pc.url as cover_url,
    coalesce(pp.cnt, 0)::integer as photo_count,
    p.boosted, p.boosted_until,
    p.deposit_basis, p.deposit_value, p.deposit_kind, p.min_nights, p.min_months
  from public.properties p
  left join lateral (
    select property_photos.url
    from public.property_photos
    where property_photos.property_id = p.id and property_photos."position" = 0
    limit 1
  ) pc on true
  left join (
    select property_photos.property_id, count(*) as cnt
    from public.property_photos
    group by property_photos.property_id
  ) pp on pp.property_id = p.id;

-- ===========================================================================
-- 4. LA VENTILATION, SUR LA RESERVATION
-- ===========================================================================
-- amount_minor NE CHANGE PAS DE SENS : il reste ce que touche le bailleur,
-- caution comprise, et release_booking continue de le verser en un seul
-- virement. Ces colonnes disent seulement DE QUOI il est fait — ce que le
-- contrat doit ecrire, ce que la console admin doit montrer a l'arbitre d'un
-- litige, et ce qu'une restitution partielle pourra un jour exprimer.
--
-- Aujourd'hui cette information ne vit que dans contract->>'deposit_minor' :
-- un jsonb nullable, sans contrainte, qu'aucune requete ne peut agreger.
alter table public.bookings
  add column if not exists deposit_minor  bigint not null default 0,
  add column if not exists deposit_kind   text   null,
  add column if not exists discount_minor bigint not null default 0,
  add column if not exists rate_plan      jsonb  null;

comment on column public.bookings.deposit_minor is
  'Part de amount_minor qui est une caution ou des frais d''agence. N''est PAS un '
  'montant supplementaire : amount_minor le contient deja.';
comment on column public.bookings.discount_minor is
  'Ecart entre le tarif lineaire et le prix reellement facture par la grille. '
  'Sert a l''affichage (« tu economises X ») et a rendre le contrat verifiable '
  'ligne a ligne ; aucun calcul d''argent ne le relit.';
comment on column public.bookings.rate_plan is
  'Le decoupage retenu par le moteur, fige au moment de la demande : '
  '{ parts: [{units, price_minor, count}], full_minor }. Le prix d''une '
  'reservation est IMMUABLE des la demande — aucune fonction ne fait jamais '
  '« update bookings set amount_minor » — donc ceci est une trace d''audit, pas '
  'une source de recalcul.';

alter table public.bookings
  add constraint bookings_deposit_kind_ck check (
    deposit_kind is null or deposit_kind in ('caution', 'agency_fee')),
  -- La caution est une PART du montant, jamais davantage.
  add constraint bookings_deposit_within_amount_ck check (
    deposit_minor >= 0 and deposit_minor <= amount_minor),
  add constraint bookings_discount_nonneg_ck check (discount_minor >= 0);

-- ===========================================================================
-- 5. CONTROLE
-- ===========================================================================
do $check$
declare
  v_backfilled bigint;
  v_orphans    bigint;
begin
  select count(*) into v_backfilled
    from public.properties
   where type = 'location' and per_month and deposit_basis = 'months' and deposit_value = 1;

  -- Une annonce mensuelle SANS caution declaree signifierait qu'on vient d'en
  -- retirer une a un bailleur sans le lui dire.
  select count(*) into v_orphans
    from public.properties
   where type = 'location' and per_month and deposit_basis is null;

  if v_orphans > 0 then
    raise exception 'REPRISE INCOMPLETE : % annonce(s) mensuelle(s) sans caution declaree', v_orphans;
  end if;

  raise notice 'conditions de location posees — % annonce(s) mensuelle(s) reprises a 1 mois de caution', v_backfilled;
end
$check$;
