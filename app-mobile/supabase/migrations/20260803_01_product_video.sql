-- 20260803_01_product_video.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- VIDÉO PRODUIT (parité avec l'immobilier — client 2026-08-03).
--
-- 1) Ajoute la colonne optionnelle `video_url` sur products (comme properties).
-- 2) Crée le bucket de stockage public `product-videos` (les vidéos produit y
--    sont uploadées via URL signée par l'edge fn photo-upload-url, kind
--    'product-video' ; lecture publique comme les photos produit).
--
-- ⚠️ Appliquer AVANT de déployer les edge functions mises à jour : celles-ci
--    font `select ..., video_url, ...` et échoueraient si la colonne manque.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1) Colonne vidéo produit
alter table public.products
  add column if not exists video_url text;

-- 2) Bucket public product-videos (upload via signed URL service-role, lecture publique)
insert into storage.buckets (id, name, public)
values ('product-videos', 'product-videos', true)
on conflict (id) do nothing;

commit;
