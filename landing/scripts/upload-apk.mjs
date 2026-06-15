// Publish the Android APK to a STABLE Vercel Blob URL: .../linky.apk (no random
// suffix), so the landing's /linky.apk download never changes between builds.
//
// Usage (from landing/, with BLOB_READ_WRITE_TOKEN in env or .env.local):
//   node scripts/upload-apk.mjs <path-to.apk>
//   node scripts/upload-apk.mjs --copy <existing-blob-url>   (no re-upload)
//
// After it prints the URL, that URL is the same every time — set it once as the
// /linky.apk rewrite destination in vercel.json. To ship a new build, just run
// this again with the new .apk; the URL stays linky.apk.
import { put, copy } from '@vercel/blob';
import { createReadStream } from 'node:fs';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');

const args = process.argv.slice(2);
const opts = { access: 'public', token, addRandomSuffix: false, allowOverwrite: true };

let blob;
if (args[0] === '--copy') {
  blob = await copy(args[1], 'linky.apk', { access: 'public', token, addRandomSuffix: false });
} else {
  blob = await put('linky.apk', createReadStream(args[0]), {
    ...opts,
    multipart: true,
    contentType: 'application/vnd.android.package-archive',
  });
}
console.log('STABLE_URL=' + blob.url);
