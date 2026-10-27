-- ════════════════════════════════════════════════════════════════════════
--  CARROUSEL DE L'ACCUEIL : VIDÉOS DE PUB + CHIFFRES CLÉS (client 2026-10-27)
--
--  « C'est là que je veux qu'on remplace par des chiffres clés de l'appli et
--  des vidéos de publicité. » Le carrousel montrait des annonces ; il montre
--  désormais une diapositive de chiffres, puis les vidéos de pub.
--
--  1. home_promos — les vidéos (ou images) de pub. Gérées CÔTÉ SERVEUR : en
--     changer ne demande aucune mise à jour de l'application. Lues par la
--     fonction list-home-promos (clé de service) ; aucun accès direct anon /
--     authenticated, RLS active sans politique.
--  2. Le seau de stockage public « home-promos » pour les fichiers.
--  3. app_public_counts(p_excluded) — tous les chiffres en UNE requête. Le
--     nombre de VILLES distinctes ne se compte pas avec un simple count côté
--     client ; et une seule requête vaut mieux que six allers-retours.
--     p_excluded = les comptes internes (liste tenue dans app-stats).
--
--  Purement additive : une table, un seau, une fonction. Rien d'existant
--  n'est modifié.
-- ════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.home_promos (
  id          uuid primary key default uuidv7(),
  title       text,
  subtitle    text,
  video_url   text,
  poster_url  text,
  -- Où mène un appui : un chemin de l'app (« /(tabs)/marche ») ou une URL.
  link_url    text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint home_promos_has_media check (video_url is not null or poster_url is not null)
);

alter table public.home_promos enable row level security;
revoke all on public.home_promos from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('home-promos', 'home-promos', true)
on conflict (id) do nothing;

create or replace function public.app_public_counts(p_excluded uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'listings', (select count(*) from public.products   where status = 'active')
              + (select count(*) from public.properties where status = 'active'),
    'shops',    (select count(*) from public.shops),
    'cities',   (select count(distinct city) from (
                   select city from public.products   where status = 'active'
                   union all
                   select city from public.properties where status = 'active'
                 ) c
                 where city is not null and city <> ''),
    'users',    (select count(*) from public.users
                 where status <> 'deleted' and not is_admin and not (id = any(p_excluded))),
    'sales',    (select count(*) from public.orders
                 where status = 'released' and not (buyer_id = any(p_excluded))),
    'bookings', (select count(*) from public.bookings
                 where status in ('active', 'completed') and not (tenant_id = any(p_excluded)))
  );
$fn$;

-- Durcissement du 2026-07-29 : une fonction SECURITY DEFINER n'est exécutable
-- que par le service, jamais depuis l'application.
revoke all on function public.app_public_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.app_public_counts(uuid[]) to service_role;

commit;
