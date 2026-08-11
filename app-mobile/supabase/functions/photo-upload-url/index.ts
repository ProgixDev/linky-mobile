// Returns a one-shot signed upload URL for marketplace media (photos + a
// property video). `kind` selects the bucket, the in-bucket folder AND the
// allowed content types. The client PUTs the file directly to Supabase Storage
// with this URL — no proxying through the edge function. The matching public_url
// is precomputed and returned so the client can stash it without a second round trip.
//
// Path layout:
//   product:        products/<user_id>/<random>-<file>        in bucket product-photos
//   property:       properties/<user_id>/<random>-<file>      in bucket property-photos
//   avatar:         avatars/<user_id>/<random>-<file>         in bucket avatars
//   property-video: property-videos/<user_id>/<random>-<file> in bucket property-videos
// The user_id prefix makes housekeeping (e.g. delete-on-account-deletion) trivial.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Kind = 'product' | 'property' | 'avatar' | 'property-video' | 'product-video';
interface Body { kind: Kind; filename: string; content_type: string }

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

const KINDS: Record<Kind, { bucket: string; folder: string; mimes: string[] }> = {
  product:          { bucket: 'product-photos',  folder: 'products',        mimes: IMAGE_MIMES },
  property:         { bucket: 'property-photos',  folder: 'properties',      mimes: IMAGE_MIMES },
  avatar:           { bucket: 'avatars',          folder: 'avatars',         mimes: IMAGE_MIMES },
  'property-video': { bucket: 'property-videos',  folder: 'property-videos', mimes: VIDEO_MIMES },
  'product-video':  { bucket: 'product-videos',   folder: 'product-videos',  mimes: VIDEO_MIMES },
};

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.kind !== 'string' || !(x.kind in KINDS)) return false;
  if (typeof x.filename !== 'string' || !NAME_RE.test(x.filename)) return false;
  if (typeof x.content_type !== 'string' || !KINDS[x.kind as Kind].mimes.includes(x.content_type)) return false;
  return true;
}

function randomSegment(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(makePost<Body>('/v1/photos/upload-url', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const { bucket, folder } = KINDS[body.kind];
  const path = `${folder}/${userId}/${randomSegment()}-${body.filename}`;

  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[photo-upload-url] createSignedUploadUrl error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur génération URL');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throwApi('CONFIG_MISSING', 500, 'Configuration manquante');
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

  return {
    body: {
      upload_url: data.signedUrl,
      token: data.token,
      path,
      public_url: publicUrl,
      content_type: body.content_type,
    },
  };
}));
