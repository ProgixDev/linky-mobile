// LE VOCABULAIRE DES NOTIFICATIONS, PARTAGÉ PAR LE SERVEUR ET LES DEUX APPS.
//
// ┌─ POURQUOI CE FICHIER EXISTE EN DOUBLE ──────────────────────────────────┐
// Deno ne peut pas importer hors de supabase/functions, Metro ne peut pas
// importer depuis @shared. Ce module vit donc en deux exemplaires OCTET POUR
// OCTET identiques, gardés par scripts/check-twins.mjs.
//
// Ici, la divergence ne coûte pas un arrondi : elle fait DISPARAÎTRE des
// notifications. Sur Android, un push qui nomme un canal absent du téléphone
// n'est pas affiché du tout — pas de son, pas de bandeau, rien, et aucune
// erreur nulle part. Le serveur et l'app doivent donc s'entendre au caractère
// près sur les identifiants ci-dessous.
// └─────────────────────────────────────────────────────────────────────────┘

export type NotifyKind =
  /** Nouvelle commande — pour le vendeur. */
  | 'order'
  /** Nouvelle demande de réservation — pour le propriétaire ou l'agence. */
  | 'booking'
  /** Nouvelle course — pour le livreur. */
  | 'delivery'
  /** Ça a abouti : paiement accepté, réservation confirmée, retrait effectué. */
  | 'success'
  /** Ça n'a pas abouti : paiement refusé, annulation, litige. */
  | 'failure'
  /** Messagerie. */
  | 'message'
  /** Neutre : information, système. */
  | 'info';

/**
 * LA VERSION DU JEU DE CANAUX, ET LA RAISON D'ÊTRE DE CE NOMBRE.
 *
 * Le son d'un canal Android est IMMUABLE après sa création : re-déclarer le
 * même identifiant avec un nouveau son ne fait rien du tout, et supprimer un
 * canal s'affiche à l'utilisateur dans les réglages (Android compte les
 * suppressions). Changer un son exige donc de NOUVEAUX identifiants.
 *
 * Chaque téléphone déclare la version qu'il connaît en enregistrant son jeton
 * (`push_tokens.channels_v`). Le serveur ne nomme un canal que s'il est sûr que
 * l'appareil l'a créé — sinon il n'envoie aucun `channelId` et la notification
 * retombe sur le canal par défaut, silencieuse mais VISIBLE. Sans ce garde-fou,
 * le jour où l'on ajoute les vrais sons, tous les téléphones restés sur
 * l'ancienne version cesseraient d'afficher quoi que ce soit.
 */
export const CHANNELS_VERSION = 1;

export interface ChannelSpec {
  kind: NotifyKind;
  /** Identifiant du canal Android, VERSIONNÉ. Jamais réutilisé pour un autre son. */
  id: string;
  /** Ce que l'utilisateur lit dans les réglages Android de l'application. */
  name: string;
  description: string;
  /** Traduit en AndroidImportance côté app. 'max' = bandeau + son. */
  importance: 'max' | 'high' | 'default';
  /** Motif de vibration. C'est LUI qui distingue les événements tant que les
   *  fichiers son ne sont pas embarqués — et il n'exige aucun build. */
  vibration: number[];
  /**
   * Nom du fichier son embarqué, SANS extension (res/raw sur Android,
   * bundle sur iOS). `null` = son système.
   *
   * Reste `null` en version 1 : un son personnalisé est un réglage de BUILD
   * (le fichier est copié dans le natif au prebuild), il ne peut pas arriver
   * par une mise à jour OTA. Le jour où les fichiers du client sont intégrés,
   * on incrémente CHANNELS_VERSION et on crée des identifiants `.v2`.
   */
  sound: string | null;
}

export const CHANNELS: Record<NotifyKind, ChannelSpec> = {
  order: {
    kind: 'order',
    id: 'linky.order.v1',
    name: 'Commandes',
    description: "Une nouvelle commande vient d'arriver dans ta boutique.",
    importance: 'max',
    vibration: [0, 200, 100, 200, 100, 400],
    sound: null,
  },
  booking: {
    kind: 'booking',
    id: 'linky.booking.v1',
    name: 'Réservations',
    description: 'Une demande de réservation ou une signature attend ta réponse.',
    importance: 'max',
    vibration: [0, 400, 150, 400],
    sound: null,
  },
  delivery: {
    kind: 'delivery',
    id: 'linky.delivery.v1',
    name: 'Livraisons',
    description: "Une course t'a été confiée, ou son état a changé.",
    importance: 'max',
    vibration: [0, 120, 80, 120, 80, 120, 80, 120],
    sound: null,
  },
  success: {
    kind: 'success',
    id: 'linky.success.v1',
    name: 'Confirmations',
    description: 'Paiement accepté, réservation confirmée, retrait effectué.',
    importance: 'high',
    vibration: [0, 180],
    sound: null,
  },
  failure: {
    kind: 'failure',
    id: 'linky.failure.v1',
    name: 'Échecs et annulations',
    description: "Un paiement n'a pas abouti, ou une demande a été annulée.",
    importance: 'high',
    vibration: [0, 500, 200, 500],
    sound: null,
  },
  message: {
    kind: 'message',
    id: 'linky.message.v1',
    name: 'Messages',
    description: 'Messagerie entre acheteurs et vendeurs.',
    importance: 'high',
    vibration: [0, 120],
    sound: null,
  },
  info: {
    kind: 'info',
    id: 'linky.info.v1',
    name: 'Informations',
    description: 'Annonces et informations de Linky.',
    importance: 'default',
    vibration: [0, 100],
    sound: null,
  },
};

/** Tous les canaux, dans l'ordre où ils apparaîtront dans les réglages Android. */
export const ALL_CHANNELS: ChannelSpec[] = [
  CHANNELS.order,
  CHANNELS.booking,
  CHANNELS.delivery,
  CHANNELS.success,
  CHANNELS.failure,
  CHANNELS.message,
  CHANNELS.info,
];

/**
 * L'identifiant de canal à envoyer à CET appareil, ou `null` s'il ne faut pas
 * en envoyer. `deviceVersion` vient de push_tokens.channels_v : 0 = un bundle
 * antérieur à ce lot, qui n'a créé aucun de ces canaux.
 */
export function channelIdFor(kind: NotifyKind, deviceVersion: number): string | null {
  if (!Number.isFinite(deviceVersion) || deviceVersion < 1) return null;
  return CHANNELS[kind]?.id ?? null;
}

/**
 * Le son iOS. Sur iOS le son voyage DANS le push (champ `sound`) ; sur Android
 * il appartient au canal et ce champ est ignoré. D'où les deux mécanismes.
 */
export function iosSoundFor(kind: NotifyKind): string {
  const s = CHANNELS[kind]?.sound;
  return s ? `${s}.wav` : 'default';
}

/**
 * LA CATÉGORIE « DEMANDE À TRANCHER » — les deux boutons Accepter / Refuser
 * dans le bandeau de notification.
 *
 * Les deux actions OUVRENT l'application. Répondre sans l'ouvrir serait plus
 * élégant, mais expo-notifications ne déclenche aucun écouteur quand l'app a
 * été TUÉE : le vendeur croirait avoir accepté, et rien ne serait parti. Un
 * bouton qui ouvre l'écran de décision tient toujours sa promesse.
 */
export const DECISION_CATEGORY_ID = 'linky.decision';
export const DECISION_ACCEPT = 'accept';
export const DECISION_DECLINE = 'decline';

/** Les événements qui font du bruit même quand l'application est ouverte. */
export function playsSoundInForeground(kind: NotifyKind): boolean {
  return kind === 'order' || kind === 'booking' || kind === 'delivery' || kind === 'failure';
}
