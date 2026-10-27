import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { usePrefs } from '../stores/prefs';
import { UI_SOUNDS_ENABLED } from './flags';

/**
 * LES SONS DANS L'APPLICATION (client 2026-09-28, redemandé le 2026-10-25).
 *
 * Sa demande couvrait deux choses, et seule la première avait été construite :
 *   - les NOTIFICATIONS (app fermée) : sons posés sur les canaux Android le
 *     2026-09-27, et bien installés sur son téléphone (canaux v2 déclarés) ;
 *   - ce qui se passe PENDANT qu'on utilise l'app : « Paiement refusé, Ajout
 *     panier si pas possible… tout ce qui ne peut pas être validé », et pour la
 *     validation « Paiement accepté, réservation confirmée, retrait… ». Rien ne
 *     jouait de son à l'écran — l'app n'avait même aucun outil pour le faire.
 *
 * ┌─ POURQUOI LE LECTEUR VIDÉO ─────────────────────────────────────────────┐
 * Le module audio d'Expo est une dépendance NATIVE : l'ajouter impose un
 * nouveau build et une nouvelle version sur le Play Store. expo-video est déjà
 * embarqué (fil Découvrir, accueil) et son lecteur lit aussi un simple fichier
 * son : ces sons partent en mise à jour OTA le jour même. À remplacer par
 * expo-audio au prochain build — c'est l'outil prévu pour ça.
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Trois règles :
 *   - un son ne casse JAMAIS un écran : toute erreur est avalée ;
 *   - la musique de l'utilisateur est BAISSÉE un instant, pas coupée ;
 *   - deux sons rapprochés n'en font qu'un (une erreur de formulaire qui
 *     déclenche trois messages ne doit pas faire trois bruits).
 */

export type UiSound = 'success' | 'failure';

const SOURCES: Record<UiSound, number> = {
  success: require('../../assets/sounds/ui-validation.wav'),
  failure: require('../../assets/sounds/ui-echec.wav'),
};

const MIN_GAP_MS = 700;
const players: Partial<Record<UiSound, VideoPlayer>> = {};
let lastPlayedAt = 0;

function playerFor(kind: UiSound): VideoPlayer {
  const existing = players[kind];
  if (existing) return existing;
  const p = createVideoPlayer(SOURCES[kind]);
  p.loop = false;
  p.muted = false;
  p.volume = 0.8;
  p.audioMixingMode = 'duckOthers';
  p.showNowPlayingNotification = false;
  p.staysActiveInBackground = false;
  players[kind] = p;
  return p;
}

export function playUiSound(kind: UiSound): void {
  if (!UI_SOUNDS_ENABLED) return;
  if (!usePrefs.getState().uiSounds) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;
  try {
    const p = playerFor(kind);
    p.currentTime = 0;
    p.play();
  } catch (e) {
    if (__DEV__) console.warn('[uiSound] lecture impossible', e);
  }
}
