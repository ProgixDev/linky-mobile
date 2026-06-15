// Direct Android APK download.
//
// This points at the EAS build artifact for the current preview build. EAS
// artifact URLs are public (no login) and stay valid for the build's retention
// window. Two things to know:
//   1. To publish a NEW build, replace ANDROID_APK_URL with the new artifact
//      link (eas build:view <id> --json → .artifacts.buildUrl).
//   2. For a permanent public download, host the .apk on a CDN / object store
//      (e.g. Vercel Blob, S3, the client's server) and point this there — the
//      file is ~238 MB so it should NOT be committed to the repo.
export const ANDROID_APK_URL =
  'https://expo.dev/artifacts/eas/GdFLNzWqP8HjDuIaphl4ZOBiw_L9OZMW1ay1OnORhsY.apk';

// Same-origin path the download button actually links to. `vercel.json`
// rewrites `/linky.apk` to ANDROID_APK_URL and sets Content-Disposition so the
// file saves as "linky.apk" (a cross-origin EAS link would keep its hash name).
// To publish a new build: update ANDROID_APK_URL above AND the matching
// destination in vercel.json.
export const ANDROID_APK_PATH = '/linky.apk';

// Shown next to the download CTA so users know what they're getting.
export const ANDROID_APK_LABEL = 'Android · APK';
