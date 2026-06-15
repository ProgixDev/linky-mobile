// Returns a one-shot signed upload URL for marketplace photos (products + properties).
// kind selects the bucket (product-photos vs property-photos) and the in-bucket folder.
// The client PUTs the file directly to Supabase Storage with this URL — no proxying
// through the edge function. The matching public_url is precomputed and returned so
// the client can stash it without a second round trip.
//
// Path layout:
//   product:  products/<user_id>/<random>-<safe-filename>   in bucket product-photos
//   property: properties/<user_id>/<random>-<safe-filename> in bucket property-photos
//   avatar:   avatars/<user_id>/<random>-<safe-filename>    in bucket avatars
// The user_id prefix makes housekeeping (e.g. delete-on-account-deletion) trivial.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Kind = 'product' | 'property' | 'avatar';
interface Body { kind: Kind; filename: string; content_type: string }

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

const BUCKETS: Record<Kind, { bucket: string; folder: string }> = {
  product:  { bucket: 'product-photos',  folder: 'products' },
  property: { bucket: 'property-photos', folder: 'properties' },
  avatar:   { bucket: 'avatars',         folder: 'avatars' },
};

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.kind !== 'product' && x.kind !== 'property' && x.kind !== 'avatar') return false;
  if (typeof x.filename !== 'string' || !NAME_RE.test(x.filename)) return false;
  if (typeof x.content_type !== 'string' || !ALLOWED.includes(x.content_type)) return false;
  return true;
}

function randomSegment(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(makePost<Body>('/v1/photos/upload-url', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const { bucket, folder } = BUCKETS[body.kind];
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
