// Android APK download. `/linky.apk` (vercel.json) 302-redirects to
// https://github.com/ProgixDev/linky-downloads/releases/latest/download/linky.apk
// — stable and non-expiring, unlike the EAS artifact URL used briefly before
// it (that one dies 30 days after each build; see DOWNLOAD_HOSTING.md for the
// full history, including why Vercel Blob was abandoned first).
//
// To ship a NEW build:
//   1. eas build --platform android --profile preview
//   2. gh release create vX.Y.Z <path-to.apk>#linky.apk --repo ProgixDev/linky-downloads \
//        --title "Linky X.Y.Z (Android) — <short highlight>" --notes "<release notes>"
// No code edit or redeploy needed here — "latest" resolves automatically.
export const ANDROID_APK_PATH = '/linky.apk';

// Companion driver app — served the same way (Blob + vercel.json rewrite/headers).
export const DRIVER_APK_PATH = '/linky-driver.apk';

// Shown next to the download CTA so users know what they're getting.
export const ANDROID_APK_LABEL = 'Android · APK';
