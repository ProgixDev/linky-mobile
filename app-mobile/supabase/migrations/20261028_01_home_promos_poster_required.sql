-- ════════════════════════════════════════════════════════════════════════
--  home_promos : une VIDÉO exige une AFFICHE (2026-10-28)
--
--  Hors wifi — la plupart des téléphones en Guinée — une vidéo de pub ne se
--  lance pas seule (règle de la 3G) : le carrousel montre son AFFICHE et un
--  bouton lecture, et la vidéo ne se lit que d'un appui. Une ligne avec
--  video_url mais sans poster_url donnerait une bannière vide jusqu'à cet
--  appui. La contrainte de 20261027_01 (« vidéo OU affiche ») le permettait.
--
--  Relevé par la relecture adversariale du carrousel. La table est VIDE au
--  2026-10-28 : la contrainte s'ajoute sans reprise de données.
--  Une image seule (poster_url sans vidéo) reste permise.
-- ════════════════════════════════════════════════════════════════════════

alter table public.home_promos
  add constraint home_promos_video_has_poster
  check (video_url is null or poster_url is not null);
