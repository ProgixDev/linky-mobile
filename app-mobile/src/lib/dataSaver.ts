import { usePrefs } from '../stores/prefs';

// Phase pre-prod — single source of truth for "what should an Image do when
// data-saver is on". expo-image's `priority` lowers the network fetch slot ;
// dropping `transition` skips the per-image fade. Photo carousels in lists
// pay both costs whenever the viewport scrolls past a card, so this
// meaningfully cuts bytes + main-thread work on a 3G phone.
//
// Pass active=true for the card the user is looking at (the visible Discover
// reel, a product hero) so it still loads at decent priority even in saver
// mode — we only deprioritize the *unseen* cards.
export function useDataSaverImageProps(active: boolean = false): {
  transition: number;
  priority: 'low' | 'normal' | 'high';
} {
  const dataSaver = usePrefs((s) => s.dataSaver);
  if (dataSaver) {
    return { transition: 0, priority: active ? 'normal' : 'low' };
  }
  return { transition: 120, priority: active ? 'high' : 'normal' };
}

// Boolean shortcut for spots that only need to disable a side-effect (video
// autoplay, carousel rotation, list prefetch) when saver is on.
export function useDataSaver(): boolean {
  return usePrefs((s) => s.dataSaver);
}
