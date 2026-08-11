-- Storage bucket for listing videos (property real-estate). Public read, 50 MB
-- cap, mp4 / mov / webm. Feeds photo-upload-url kind='property-video' and the
-- property video_url field. Apply via the Supabase SQL editor (the CLI push is
-- unusable on this project — see migration-history notes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-videos',
  'property-videos',
  true,
  52428800,  -- 50 MB
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
