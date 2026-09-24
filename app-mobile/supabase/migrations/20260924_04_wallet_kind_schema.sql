-- DEUX CAISSES : « VENDEUR » ET « IMMO ». 1/2 — LE SCHEMA.
--
-- Demande du client, 2026-09-24 : « N'oublie pas pour la separation des
-- differents Wallets "Vendeur" et "Immo" ».
--
-- ELLE ETAIT PROMISE. Le 2026-09-09 il signalait « j'ai pas eu de reservation
-- de logement mais mon Wallet Immo est credite ». Son diagnostic etait juste :
-- il n'existe qu'UN portefeuille par personne, montre sur trois tableaux de
-- bord differents. Ses 10 000 GNF venaient d'une vente d'article. Il avait
-- valide la ventilation par origine (20260909_01) COMME ETAPE D'ATTENTE. La
-- voici, l'etape d'apres.
--
-- ┌─ LE DANGER, ET IL EST SILENCIEUX ─────────────────────────────────────────┐
-- Vingt-trois endroits ecrivent aujourd'hui :
--     select id into v_wallet from public.wallets
--      where user_id = X and currency = 'GNF';
-- Tant qu'il n'existe qu'une ligne par personne, c'est exact. Des qu'il en
-- existe deux, `select ... into` prend UNE ligne sans erreur ni avertissement —
-- celle que le plan d'execution rend en premier. Une vente d'article pourrait
-- ainsi crediter la caisse Immo, un retrait vider la mauvaise. Rien ne
-- planterait ; les comptes seraient simplement faux.
-- C'est pourquoi cette migration ne fait QUE le schema, et pourquoi la suivante
-- (20260924_05) desambigue les vingt-trois sites AVANT qu'une seule caisse Immo
-- n'existe. Le defaut 'seller' garantit l'entre-deux : tant que personne ne
-- cree de caisse Immo, chaque lecture reste unique et le comportement actuel
-- est rigoureusement inchange.
--
-- LES COMPTES SYSTEME N'ONT QU'UNE CAISSE, et c'est ce qui rend l'operation
-- tenable. Le sequestre (…0001) et la plateforme (…0002) sont resolus dans
-- VINGT-SEPT autres endroits, de la meme facon. En leur interdisant la caisse
-- Immo, ces vingt-sept lectures restent non ambigues sans qu'on y touche. Un
-- sequestre scinde n'aurait d'ailleurs aucun sens : il ne detient l'argent de
-- personne, il le detient POUR quelqu'un, et c'est la reservation ou la
-- commande qui dit de quoi il s'agit.
--
-- AUCUN ARGENT NE BOUGE ICI. Les sept portefeuilles existants deviennent des
-- caisses 'seller' par defaut ; le grand livre pointe sur des wallet_id
-- inchanges. Une caisse Immo ne naitra qu'au premier loyer encaisse.

alter table public.wallets
  add column if not exists kind text not null default 'seller';

alter table public.wallets drop constraint if exists wallets_kind_check;
alter table public.wallets
  add constraint wallets_kind_check check (kind in ('seller', 'immo'));

-- Le sequestre et la plateforme ne se scindent pas (voir ci-dessus).
alter table public.wallets drop constraint if exists wallets_system_single_kind;
alter table public.wallets
  add constraint wallets_system_single_kind check (
    kind = 'seller'
    or user_id not in (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    )
  );

-- L'unicite porte desormais sur la caisse. L'ancienne contrainte doit tomber,
-- sinon elle interdirait la deuxieme caisse d'une meme personne.
do $mig$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.wallets'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (user_id, currency)';
  if v_con is not null then
    execute format('alter table public.wallets drop constraint %I', v_con);
  end if;
end
$mig$;

create unique index if not exists wallets_user_kind_currency_uniq
  on public.wallets (user_id, kind, currency);

comment on column public.wallets.kind is
  'Caisse : seller = ventes d''articles, achats, recharges, retraits ; immo = loyers et ventes de biens. Les comptes systeme n''ont que seller.';

-- ============================================================================
-- LE RESOLVEUR UNIQUE. Toute fonction qui a besoin de la caisse de quelqu'un
-- passe par ici desormais : un seul endroit sait creer la ligne manquante, et
-- un seul endroit peut se tromper de caisse.
create or replace function public.user_wallet(
  p_user_id  uuid,
  p_kind     text,
  p_currency text default 'GNF'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if p_kind not in ('seller', 'immo') then
    raise exception 'INVALID_WALLET_KIND';
  end if;

  select id into v_id from public.wallets
   where user_id = p_user_id and kind = p_kind and currency = p_currency;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.wallets (user_id, kind, currency)
    values (p_user_id, p_kind, p_currency)
    on conflict (user_id, kind, currency) do update set updated_at = now()
    returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.user_wallet(uuid, text, text) from public, anon, authenticated;
grant execute on function public.user_wallet(uuid, text, text) to service_role;

-- ============================================================================
-- LES RETRAITS SAVENT DE QUELLE CAISSE ILS SORTENT.
-- Les demandes deja enregistrees portent 'seller' : c'est la seule caisse qui
-- existait quand elles ont ete faites.
alter table public.withdrawal_requests
  add column if not exists wallet_kind text not null default 'seller';
alter table public.withdrawal_requests drop constraint if exists withdrawal_requests_wallet_kind_check;
alter table public.withdrawal_requests
  add constraint withdrawal_requests_wallet_kind_check check (wallet_kind in ('seller', 'immo'));
