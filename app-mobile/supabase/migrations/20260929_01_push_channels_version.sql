-- ===========================================================================
-- QUELS CANAUX DE NOTIFICATION CET APPAREIL CONNAÎT-IL ?
-- 2026-09-29 · prépare les sons par type d'événement (demande client du 28/09)
-- ===========================================================================
--
-- LE PIÈGE QU'ON FERME. Sur Android, le son d'une notification appartient au
-- CANAL, pas au message : pour que « commande », « réservation » et « livraison »
-- sonnent différemment, le serveur doit nommer un canal dans chaque push. Or si
-- le canal nommé n'existe pas encore sur le téléphone, Android **n'affiche rien
-- du tout** — pas de son, pas de bandeau, aucune erreur, ni côté appareil ni
-- côté serveur.
--
-- Les canaux sont créés par l'application au démarrage. Un téléphone qui n'a pas
-- encore pris la mise à jour n'en a donc aucun. Sans cette colonne, le jour du
-- déploiement, tous ces téléphones deviendraient muets ET aveugles, en silence.
--
-- Chaque appareil déclare donc, en enregistrant son jeton, la version du jeu de
-- canaux que son bundle connaît (`notifyKinds.ts` → CHANNELS_VERSION). Le
-- serveur ne nomme un canal que s'il est certain que l'appareil l'a créé ;
-- sinon il n'en nomme aucun et la notification retombe sur le canal par défaut :
-- son générique, mais VISIBLE.
--
-- La même colonne servira le jour où les vrais fichiers son du client seront
-- intégrés : un son de canal est IMMUABLE après création, changer un son exige
-- de nouveaux identifiants, donc une version 2 — que seuls les téléphones à jour
-- recevront, les autres continuant de fonctionner avec la version 1.

begin;

alter table public.push_tokens
  add column if not exists channels_v integer not null default 0;

comment on column public.push_tokens.channels_v is
  'Version du jeu de canaux de notification connue par CE bundle (0 = antérieur '
  'aux canaux nommés). Le serveur ne nomme un canal Android que si cette version '
  'le couvre : nommer un canal absent rend la notification invisible.';

-- Aucun rattrapage des lignes existantes : un jeton enregistré par un bundle
-- antérieur n'a effectivement créé aucun canal. Il repassera à 1 tout seul au
-- prochain démarrage de l'application, l'enregistrement du jeton étant un upsert
-- rejoué à chaque lancement.

do $check$
declare
  v_n   int;
  v_def text;
begin
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'push_tokens' and column_name = 'channels_v';
  if v_n <> 1 then raise exception 'push_tokens.channels_v absente'; end if;

  select column_default into v_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'push_tokens' and column_name = 'channels_v';
  if v_def is null or position('0' in v_def) = 0 then
    raise exception 'push_tokens.channels_v doit valoir 0 par defaut, trouve : %', v_def;
  end if;

  raise notice 'push_tokens.channels_v posee (defaut 0) : % jeton(s) existant(s) a 0',
    (select count(*) from public.push_tokens where channels_v = 0);
end
$check$;

commit;
