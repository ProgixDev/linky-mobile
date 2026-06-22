# Pack: media-upload

Pick (or capture) an image and upload it to a **private** Supabase Storage bucket, with **per-user
folders** enforced by RLS and **short-lived signed URLs** for reads. Logic-first; UI is a
placeholder. **Key-free** to build.

## What you get

- `services/upload.ts` — `pickImage` (permission + picker, never throws), `uploadImage`
  (uploads to `<uid>/<ts>_<name>`).
- `data/media-repo.ts` — `signedUrlFor` (private read), `listMyMedia`, `deleteMedia`.
- `useMediaUpload` — pick → upload → signed preview in one call, all errors as state.
- `model/media.ts` — bucket name, path/upload Zod schemas, allowed content types.
- `MediaUploadScreen` — **placeholder** proving the round trip.
- `supabase/0010_media.sql` — creates the **private** `user-media` bucket + owner-scoped RLS on
  `storage.objects` (first path segment must equal the caller's uid).

## Install

```
/add-feature media-upload
npx expo install expo-image-picker
# apply supabase/0010_media.sql into supabase/migrations/, then:
supabase db reset
```

Add a **tailored** photo-library usage string (store-readiness requires it):

```ts
// app.config.ts → ios.infoPlist
NSPhotoLibraryUsageDescription: 'Add a photo to your profile or post.';
```

## Security

The bucket is **private** (`public = false`). Every object lives under a folder named after the
owner's uid, and RLS restricts select/insert/update/delete to objects whose first path segment is
the caller's uid — so one user can never read or overwrite another's files. Render images with
**signed URLs** (`signedUrlFor`, default 1h TTL), never public URLs; lower the TTL for sensitive
media. This mirrors the storage pattern in `docs/research/03-supabase-security.md`.
