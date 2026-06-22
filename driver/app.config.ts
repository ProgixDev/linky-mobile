import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Typed Expo config — the single source of truth for app identity.
 *
 * Environment-specific values come from EAS environment variables or
 * `.env` files (EXPO_PUBLIC_*). See docs/conventions/environments.md.
 *
 * TODO(company): set the EAS projectId + updates.url placeholders below after
 * `eas init` (the only identity values still pending before first build).
 */

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const name = IS_DEV ? 'Linky Driver (Dev)' : IS_PREVIEW ? 'Linky Driver (Preview)' : 'Linky Driver';
const bundleId = IS_DEV
  ? 'com.linky.driver.dev'
  : IS_PREVIEW
    ? 'com.linky.driver.preview'
    : 'com.linky.driver';

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
    // infoPlist: { NSCameraUsageDescription: 'Explain exactly why.' },
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
  updates: {
    // TODO(company): set after `eas init` + `eas update:configure`
    // url: 'https://u.expo.dev/<EAS_PROJECT_ID>',
  },
  extra: {
    eas: {
      // TODO(company): set after `eas init`
      // projectId: '<EAS_PROJECT_ID>',
    },
  },
});
