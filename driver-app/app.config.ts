import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Typed Expo config — the single source of truth for app identity.
 *
 * Environment-specific values come from EAS environment variables or
 * `.env` files (EXPO_PUBLIC_*). See docs/conventions/environments.md.
 *
 * EAS project id: after `eas init`, either set the `EAS_PROJECT_ID` env var or
 * paste the id as the `easProjectId` fallback below. `updates.url` is derived from
 * it. NOTE: for EAS *cloud* builds the env var isn't present on the build server,
 * so paste the literal id (or add EAS_PROJECT_ID as an EAS environment variable).
 */

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const name = IS_DEV ? 'Linky Driver (Dev)' : IS_PREVIEW ? 'Linky Driver (Preview)' : 'Linky Driver';
const bundleId = IS_DEV
  ? 'com.linky.driver.dev'
  : IS_PREVIEW
    ? 'com.linky.driver.preview'
    : 'com.linky.driver';

// Set by `eas init`. Provide via EAS_PROJECT_ID or paste the literal after `??`.
// Left empty until then so EAS prints a clear "run eas init" error rather than
// shipping a bogus id; `updates`/`extra.eas` are omitted while it's empty.
const easProjectId = process.env.EAS_PROJECT_ID ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'linky-driver',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'linkydriver',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    icon: './assets/expo.icon',
    // Answers the App Store export-compliance prompt automatically (set true
    // only if you add non-exempt encryption). Store-readiness: STORE-APL-EXPORT.
    config: {
      usesNonExemptEncryption: false,
    },
    // Required-reason API manifest (enforced at App Store Connect upload since
    // 2024-05-01). These cover Expo/RN's own usage. ADD a SDK's reasons when you
    // install it (copy from node_modules/<pkg>/ios/PrivacyInfo.xcprivacy).
    // We do NOT track users → no NSPrivacyTracking / ATT. Store-readiness: STORE-APL-PRIVMANIFEST.
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
    // Add tailored NSxxxUsageDescription strings here ONLY for permissions you
    // actually use (a generic string gets rejected; an unused permission also does).
    // The expo-camera plugin (below) also sets this; we keep an explicit, tailored
    // string here as the single source of truth for the store-review copy.
    infoPlist: {
      NSCameraUsageDescription:
        'Linky Driver uses the camera to scan the customer’s order QR code at handoff to confirm delivery.',
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Request the minimum. Strip library-added permissions you don't need, e.g.:
    // blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0F172A',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    'expo-font',
    [
      // QR-handoff scanner (spec 002, ADR-0009). Sets the iOS camera usage
      // string and adds Android CAMERA. We scan QR only — no audio/video — so
      // microphone + RECORD_AUDIO are disabled to keep the permission set minimal.
      'expo-camera',
      {
        cameraPermission:
          'Linky Driver uses the camera to scan the customer’s order QR code at handoff to confirm delivery.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      // Google Play requires targeting a recent API level (35+ since 2025-08-31;
      // expect 36 ~2026-08). Store-readiness: STORE-GP-TARGETAPI.
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  runtimeVersion: {
    policy: 'fingerprint',
  },
  // Derived from the EAS project id — no second place to keep in sync.
  updates: easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : {},
  extra: {
    eas: easProjectId ? { projectId: easProjectId } : {},
  },
});
