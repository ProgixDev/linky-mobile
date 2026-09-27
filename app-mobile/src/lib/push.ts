// Phase O.4 — Expo push registration + tap routing.
//
// Registration runs on every app start while a user is signed in (and again
// when authUserId changes), so the backend upsert reassigns the device row
// after login or account switching. The token is cached in MMKV so logout
// can unregister it without re-asking Expo.
//
// iOS pushes stay inert until the client's Apple Developer account provides
// an APNS key (EAS credentials). Android standalone builds need the Firebase
// project + google-services.json uploaded to EAS credentials. Dev builds
// work with Expo push today.

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router, useRootNavigationState } from 'expo-router';
import { apiPost } from './api';
import { storage, STORAGE_KEYS } from './storage';
import { isOpenableDeeplink } from './deeplink';
import { useAuth } from '../stores/auth';
import { usePrefs } from '../stores/prefs';
import {
  ALL_CHANNELS,
  CHANNELS_VERSION,
  DECISION_ACCEPT,
  DECISION_CATEGORY_ID,
  DECISION_DECLINE,
  playsSoundInForeground,
  type NotifyKind,
} from './notifyKinds';

// ┌─ CE QUI SE PASSE QUAND L'APP EST DEJA OUVERTE ─────────────────────────┐
// Le son etait coupe pour TOUT, avec un raisonnement valable pour la
// messagerie : le temps reel affiche deja le message, un bip de plus n'apprend
// rien. Mais la meme ligne rendait muette l'arrivee d'une COMMANDE — un vendeur
// qui a son application ouverte sur le comptoir n'entendait rien du tout. C'est
// exactement ce que le client decrit : « ils peuvent recevoir une commande sans
// le savoir ».
//
// Le son depend donc maintenant du TON de l'evenement : les demandes et les
// echecs sonnent, la messagerie et les informations restent discretes.
// └───────────────────────────────────────────────────────────────────────────┘
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const kind = (notification.request.content.data?.kind as NotifyKind | undefined) ?? 'info';
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: playsSoundInForeground(kind),
      shouldSetBadge: false,
    };
  },
});

/** La version de canaux effectivement disponible, relue a chaque
 *  enregistrement. 0 tant qu'on n'a rien pu creer. */
let channelsReady = 0;

const IMPORTANCE = {
  max: Notifications.AndroidImportance.MAX,
  high: Notifications.AndroidImportance.HIGH,
  default: Notifications.AndroidImportance.DEFAULT,
} as const;

/**
 * LES CANAUX, UN PAR TYPE D'EVENEMENT (client 2026-09-28 : « des sons de
 * notification speciale pour les commandes, reservations et livraisons »).
 *
 * Sur Android le son et la vibration appartiennent au CANAL, pas au message :
 * c'est le seul moyen d'en avoir plusieurs. Et un canal est IMMUABLE une fois
 * cree — d'ou les identifiants versionnes de notifyKinds.ts.
 *
 * Appele a CHAQUE demarrage : creer un canal existant est un no-op, et une
 * nouvelle installation doit les avoir avant le premier push. Tant que les
 * fichiers son du client ne sont pas integres (ils exigent un build), ce sont
 * les motifs de VIBRATION qui distinguent deja les trois evenements.
 */
/**
 * Cree les canaux et rend la version REELLEMENT disponible sur cet appareil.
 *
 * ┌─ POURQUOI UN RETOUR, ET PAS UN `void` ─────────────────────────────────┐
 * Le jeton declare `channels_v`, et le serveur s'en sert pour decider s'il
 * peut nommer un canal. Declarer la version VISEE plutot que celle OBTENUE
 * rouvre exactement le piege que tout ce mecanisme existe pour fermer : si la
 * creation echoue — un fichier son absent du binaire, par exemple, ce qui
 * arrive des qu'un ancien build prend une mise a jour OTA plus recente — le
 * serveur nommerait un canal inexistant et la notification disparaitrait, sans
 * son, sans banniere et sans erreur nulle part.
 *
 * On verifie donc chaque canal APRES l'avoir cree. En cas de doute on rend 0 :
 * le serveur n'envoie alors aucun channelId, et la notification s'affiche sur
 * le canal par defaut — son generique, mais VISIBLE. Perdre le son est une
 * degradation ; perdre la notification serait une panne.
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export async function ensureChannels(): Promise<number> {
  if (Platform.OS !== 'android') return CHANNELS_VERSION;
  let ok = true;
  for (const c of ALL_CHANNELS) {
    try {
      await Notifications.setNotificationChannelAsync(c.id, {
        name: c.name,
        description: c.description,
        importance: IMPORTANCE[c.importance],
        vibrationPattern: c.vibration,
        enableVibrate: true,
        lightColor: '#0E6E55',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        ...(c.sound ? { sound: `${c.sound}.wav` } : {}),
      });
      // On RELIT : setNotificationChannelAsync peut rendre la main sans avoir
      // rien cree, et c'est le seul moyen de le savoir.
      const pose = await Notifications.getNotificationChannelAsync(c.id);
      if (!pose) {
        ok = false;
        console.warn(`[push] canal ${c.id} introuvable apres creation`);
      }
    } catch (e) {
      // Un canal qui echoue ne doit pas empecher les autres d'exister, mais il
      // interdit d'annoncer cette version : le serveur nommerait un canal
      // absent et la notification disparaitrait.
      ok = false;
      console.warn(`[push] canal ${c.id} non cree :`, e);
    }
  }
  return ok ? CHANNELS_VERSION : 0;
}

/**
 * LES DEUX BOUTONS DANS LE BANDEAU. Ils OUVRENT l'application, volontairement :
 * expo-notifications ne declenche aucun ecouteur quand l'app a ete TUEE, donc un
 * bouton qui repond « sans ouvrir » mentirait une fois sur deux. Celui-ci amene
 * toujours a l'ecran ou la decision se prend pour de bon.
 */
export async function ensureDecisionCategory(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(DECISION_CATEGORY_ID, [
      {
        identifier: DECISION_ACCEPT,
        buttonTitle: 'Accepter',
        options: { opensAppToForeground: true },
      },
      {
        identifier: DECISION_DECLINE,
        buttonTitle: 'Refuser',
        options: { opensAppToForeground: true, isDestructive: true },
      },
    ]);
  } catch (e) {
    console.warn('[push] categorie de decision non enregistree :', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Simulators have no push transport — skip silently.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  // Only prompt when the OS still allows it — never re-prompt after a denial.
  if (status !== 'granted' && existing.canAskAgain) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  channelsReady = await ensureChannels();
  await ensureDecisionCategory();

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return data;
}

// Register this device's Expo push token with the backend and cache it in
// MMKV. Best-effort : a failure must never disturb the caller. Shared by the
// app-start hook and the in-app Notifications toggle.
export async function registerPushToken(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    await apiPost({
      path: '/register-push-token',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        device_label: Device.modelName ?? undefined,
        // Ce que CE bundle sait faire. Le serveur ne nommera un canal que si
        // cette version le couvre — nommer un canal absent rend la
        // notification invisible sur Android.
        channels_v: channelsReady,
      },
    });
    storage.set(STORAGE_KEYS.pushToken, token);
  } catch (e) {
    console.warn('[push] registration failed:', e);
  }
}

// Logout path. Best-effort with a hard 2.5s cap — logout must never hang on
// push state (the server treats an already-gone token as success anyway).
export async function unregisterPushToken(): Promise<void> {
  const token = storage.getString(STORAGE_KEYS.pushToken);
  if (!token) return;
  try {
    await Promise.race([
      apiPost({ path: '/unregister-push-token', body: { token } }),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (e) {
    console.warn('[push] unregister failed:', e);
  } finally {
    storage.remove(STORAGE_KEYS.pushToken);
  }
}

export function usePushRegistration(): void {
  const authUserId = useAuth((s) => s.authUserId);
  // Phase pre-prod — boot registration must respect the user's stated
  // preference. Without this, the OS-level subscription drifts back to ON on
  // every cold start, even after the user turned the toggle off.
  const notifications = usePrefs((s) => s.notifications);

  useEffect(() => {
    if (!authUserId) return;
    if (!notifications) {
      // Pref is OFF — make sure no stale token lingers on the backend. The
      // toggle's own onChange already runs unregister when the user flips it,
      // but a clean cold-start path matters when the pref was disabled on a
      // previous session and never reconciled (e.g. crash mid-flip).
      void unregisterPushToken();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token || cancelled) return;
        await apiPost({
          path: '/register-push-token',
          body: {
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            device_label: Device.modelName ?? undefined,
            channels_v: channelsReady,
          },
        });
        // Re-check after the await : if the user logged out mid-flight,
        // caching now would leave a token unregisterPushToken already missed.
        if (cancelled) return;
        storage.set(STORAGE_KEYS.pushToken, token);
      } catch (e) {
        // Best-effort : a failed registration must never disturb app start.
        console.warn('[push] registration failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, notifications]);
}

/**
 * L'INTENTION POSEE PAR UN BOUTON DU BANDEAU, en attente d'etre ramassee.
 *
 * Les deux boutons ouvrent l'application (voir ensureDecisionCategory) : ils ne
 * peuvent donc pas repondre tout seuls. Ils deposent ici ce que la personne a
 * voulu, et l'ecran de decision le ramasse a son ouverture pour le lui proposer
 * deja pret — un toucher au lieu de trois, sans jamais decider a sa place.
 *
 * Volontairement en memoire et NON persiste : une intention vieille d'un
 * redemarrage ne veut plus rien dire, et la rejouer serait pire que l'oublier.
 */
let pendingDecision: { refType: string | null; refId: string | null; action: 'accept' | 'decline' } | null = null;

/** Ramasse l'intention (et l'efface : elle ne vaut qu'une fois). */
export function takePendingDecision(refId?: string) {
  const d = pendingDecision;
  if (!d) return null;
  // Si l'ecran precise QUELLE demande il affiche, on ne lui rend l'intention
  // que si elle le concerne : sinon un « Refuser » pose sur une reservation
  // s'appliquerait a la premiere fiche ouverte ensuite.
  if (refId && d.refId && d.refId !== refId) return null;
  pendingDecision = null;
  return d;
}

export function useNotificationTapRouting(): void {
  // Cold-start taps fire before the root navigator exists — gate everything
  // on navigation readiness so router.push never throws.
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const handledId = useRef<string | null>(null);
  // Phase U.4 — guard on auth. Pre-U4 a tap from a stale notification
  // received before the user signed in would push the deeplink over
  // onboarding into an authed route ; the first authed API call would
  // 401 and the user landed on a back-less blank view. Drop the
  // deeplink in that case (stashing-until-signin is V1.1).
  const isOnboarded = useAuth((s) => s.isOnboarded);
  const authUserId = useAuth((s) => s.authUserId);

  useEffect(() => {
    if (!navReady) return;

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledId.current === id) return;
      handledId.current = id;
      // Authed routes only ; if the user isn't signed in, DROP the
      // deeplink rather than push it into a 401 loop.
      if (!isOnboarded || !authUserId) return;
      const content = response.notification.request.content;
      // Le bandeau portait-il les deux boutons, et lequel a ete presse ?
      const act = response.actionIdentifier;
      if (act === DECISION_ACCEPT || act === DECISION_DECLINE) {
        pendingDecision = {
          refType: (content.data?.refType as string | null) ?? null,
          refId: (content.data?.refId as string | null) ?? null,
          action: act === DECISION_ACCEPT ? 'accept' : 'decline',
        };
      }
      const deeplink = content.data?.deeplink;
      if (isOpenableDeeplink(deeplink)) {
        router.push(deeplink as never);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [navReady, isOnboarded, authUserId]);
}
