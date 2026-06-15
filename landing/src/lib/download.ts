// Stable Android APK download, hosted on Vercel Blob at a fixed path.
//
// The landing serves it at the same-origin /linky.apk (see vercel.json rewrite),
// so the file saves as "linky.apk" and the share URL stays clean.
//
// To ship a NEW build (set-and-forget — the URL never changes):
//   1. eas build → download the .apk
//   2. node scripts/upload-apk.mjs <path-to.apk>   (overwrites linky.apk in Blob)
// No code edit or redeploy needed — the rewrite already points at this URL.
export const ANDROID_APK_URL =
  'https://njii6olstwjlpvas.public.blob.vercel-storage.com/linky.apk';

// Same-origin path the download button actually links to. `vercel.json`
// rewrites `/linky.apk` to ANDROID_APK_URL and sets Content-Disposition so the
// file saves as "linky.apk" (a cross-origin EAS link would keep its hash name).
// To publish a new build: update ANDROID_APK_URL above AND the matching
// destination in vercel.json.
export const ANDROID_APK_PATH = '/linky.apk';

// Shown next to the download CTA so users know what they're getting.
export const ANDROID_APK_LABEL = 'Android · APK';
