-- media-upload — a PRIVATE Supabase Storage bucket with per-user folders.
-- The security model: every object lives under a folder named after the owner's
-- uid (e.g. "<uid>/photo.jpg"). RLS on storage.objects restricts every operation
-- to objects whose first path segment equals the caller's uid. Files are never
-- public — clients read them via short-lived signed URLs.

-- Create the bucket as PRIVATE (public = false). Idempotent.
insert into storage.buckets (id, name, public)
values ('user-media', 'user-media', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase. Owner-scoped policies:
-- (storage.foldername(name))[1] is the first path segment = the owner's uid.

create policy media_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy media_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy media_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy media_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
