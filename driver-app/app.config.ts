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

// « Depose » remplace « Linky Driver » le 2026-09-10 (client : « Linky driver va
// etre appele "Depose" finalement. Comme deposer un colis ou une personne »).
//
// SEUL LE NOM AFFICHE CHANGE. Le slug ('linky-driver'), le schema d'URL
// ('linkydriver') et l'identifiant de paquet ('com.linky.driver') restent : les
// toucher creerait un nouveau projet EAS, invaliderait les jetons de
// notification deja enregistres et ferait perdre l'historique du store. Le nom
// qu'on lit sur l'ecran d'accueil et l'identite technique n'ont aucune raison
// d'etre le meme mot.
const name = IS_DEV ? 'Dépose (Dev)' : IS_PREVIEW ? 'Dépose (Preview)' : 'Dépose';
const bundleId = IS_DEV
  ? 'com.linky.driver.dev'
  : IS_PREVIEW
    ? 'com.linky.driver.preview'
    : 'com.linky.driver';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'linky-driver',
  version: '1.0.0',
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
    // Camera is used for the delivery QR-handoff (spec 002, ADR-0009) only.
    infoPlist: {
      NSCameraUsageDescription:
        'Dépose uses the camera to scan the customer’s order QR code at handoff, to confirm the delivery and release the seller’s payment.',
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
    // POST_NOTIFICATIONS is the Android 13+ runtime permission for the new-delivery
    // push — declared explicitly so it is guaranteed present in the merged manifest
    // (aapt check), not only inferred from expo-notifications. CAMERA / location come
    // from expo-camera + expo-image-picker + expo-location.
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    // MESURE DU 2026-10-07, sur l'AAB vc4 LIVRE (pas sur android/, qui est
    // ignore par git et perime) : ces deux permissions etaient reellement
    // declarees, alors que rien dans l'app ne les utilise.
    //
    //   unzip -p app.aab base/manifest/AndroidManifest.xml | grep -a android.permission
    //
    // - RECORD_AUDIO : la camera ne sert qu'au scan de QR (`onBarcodeScanned`),
    //   jamais a filmer. L'option `recordAudioAndroid: false` posee sur le
    //   plugin expo-camera plus bas N'A PAS suffi a l'empecher. La demander
    //   obligerait a declarer le micro dans la Securite des donnees, alors
    //   qu'aucun son n'est jamais capte : une incoherence que la revue releve.
    // - SYSTEM_ALERT_WINDOW : elle vient du manifeste DEBUG de React Native
    //   (node_modules/react-native/ReactAndroid/src/debug/AndroidManifest.xml),
    //   tire dans le build de production parce que `expo-dev-client` est en
    //   dependance de production. « Afficher par-dessus les autres applis » est
    //   l'une des permissions les plus scrutees par Play.
    //
    // ⚠ NE JAMAIS ajouter CAMERA ici : le plugin expo-image-picker avait deja
    // strippe cette permission par ce mecanisme, et la demande systeme ne
    // s'affichait plus du tout (voir le commentaire du plugin plus bas).
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    // SANS CE FICHIER, AUCUN JETON FCM N'EST OBTENABLE en build autonome — c'est
    // la cause des 0 jetons enregistres cote livreur, et donc du fait qu'aucun
    // livreur n'a jamais pu etre alerte. Le paquet `com.linky.driver` doit
    // exister dans le projet Firebase `linky-757d0` pour que ce fichier le
    // contienne ; l'app marketplace a le sien depuis toujours.
    //
    // Le projet est en mode managed (aucun android/ dans git) : c'est EAS qui
    // genere le natif au build, et il lit cette cle pour y deposer le fichier.
    googleServicesFile: './google-services.json',
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    // VALIDATION DES DEVELOPPEURS ANDROID (echeance Google du 2026-09-30) :
    // ecrit assets/adi-registration.properties, le fichier de jeton qui prouve
    // a la Play Console qu'on detient la cle privee du paquet. Voir
    // plugins/withAdiRegistration.js — et notamment pourquoi un plugin est
    // indispensable ici (android/ est regenere a chaque build).
    './plugins/withAdiRegistration',
    'expo-router',
    [
      // Camera for the delivery QR-handoff (spec 002, ADR-0009). QR-only: we never
      // record audio, so the iOS mic string is omitted and the Android RECORD_AUDIO
      // permission is disabled (request the minimum — store-readiness STORE-* ). The
      // CNG config plugin owns the native bits — never hand-edit ios/ or android/.
      'expo-camera',
      {
        cameraPermission:
          'Dépose uses the camera to scan the customer’s order QR code at handoff, to confirm the delivery and release the seller’s payment.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        // Linky emerald — the splash shows the green brand mark on brand green.
        backgroundColor: '#0A5240',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 180,
        },
      },
    ],
    'expo-font',
    // expo-image and expo-secure-store ship config plugins in SDK 56; `expo install
    // --fix` recommends registering them. secure-store's plugin also excludes its
    // keystore entries from Android auto-backup (a security-checklist default).
    'expo-image',
    'expo-secure-store',
    [
      // compileSdk 36 is REQUIRED by expo-camera's androidx.camera:*:1.6.0 (+ androidx.core
      // 1.18 / browser 1.9) AAR metadata — a dev build fails `checkDebugAarMetadata` on 35.
      // targetSdk (runtime behavior opt-in) is kept at 35 — still valid for Google Play
      // (36 becomes required ~2026-08); bump it with on-device testing before that release.
      // Store-readiness: STORE-GP-TARGETAPI.
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 35,
        },
      },
    ],
    [
      // Live delivery map (ADR-0010). The secret DOWNLOAD token (sk.) is build-time
      // only — it comes from the EAS env (secret) / local .env, never committed.
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? '',
      },
    ],
    [
      // Foreground location for the driver's live position on the map.
      'expo-location',
      {
        locationWhenInUsePermission:
          'Dépose utilise ta position pour afficher la carte de tes livraisons et te guider vers les clients.',
      },
    ],
    [
      // Face photo (selfie / gallery) for the application + Profil.
      // cameraPermission MUST be a STRING, never `false`: with `false` the plugin
      // BLOCKS android.permission.CAMERA (withBlockedPermissions), and because it runs
      // AFTER expo-camera it STRIPPED the CAMERA permission expo-camera added → the OS
      // permission popup never appeared (Android instantly denies an undeclared
      // permission) → the scanner + selfie jumped straight to the settings fallback.
      'expo-image-picker',
      {
        photosPermission:
          'Dépose accède à tes photos pour choisir ta photo de profil / de candidature.',
        cameraPermission:
          'Dépose utilise la caméra pour scanner le QR de la livraison et prendre ta photo.',
      },
    ],
    [
      // New-delivery push. `icon` is the white-on-transparent small-icon (reuses the
      // monochrome adaptive icon) tinted Linky-green.
      //
      // `defaultChannel` ecrit `default_notification_channel_id` dans le
      // manifeste : c'est le canal qu'Android utilise quand un push n'en nomme
      // aucun. Il valait 'deliveries', un identifiant que l'app ne cree PLUS
      // depuis le passage aux canaux versionnes (2026-09-27) — le manifeste
      // pointait donc dans le vide. Il doit nommer un canal reellement cree par
      // ensureChannels(), donc celui de notify-kinds.ts.
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#0E6E55',
        defaultChannel: 'linky.delivery.v2',
        // LES SONS DU CLIENT. Le plugin les copie dans res/raw au prebuild —
        // c'est la voie officielle en projet managed, et la SEULE : un son
        // n'arrive jamais par une mise a jour OTA, il est embarque dans le
        // binaire. Un canal qui les nomme sans qu'ils soient dans le build
        // retombe silencieusement sur le son systeme.
        sounds: [
          './assets/sounds/notif_commande.wav',
          './assets/sounds/notif_livraison.wav',
          './assets/sounds/notif_validation.wav',
          './assets/sounds/notif_echec.wav',
        ],
        enableBackgroundRemoteNotifications: false,
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
    // MISES A JOUR A DISTANCE, activees le 2026-09-10. Jusqu'ici cette app ne
    // pouvait recevoir AUCUN correctif sans un build complet — l'URL etait
    // restee un TODO depuis la creation du projet.
    url: 'https://u.expo.dev/8b8fdbe2-6af0-47bb-bc0b-7c5dfa1d6c88',
  },
  owner: 'krunchy',
  extra: {
    // Re-linked under @linkyorg 2026-07-21 — fresh build quota (migration to client Supabase).
    eas: {
      projectId: '8b8fdbe2-6af0-47bb-bc0b-7c5dfa1d6c88',
    },
  },
});
