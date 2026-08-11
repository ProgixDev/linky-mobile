import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

// One-restart updates (client 2026-08-05).
//
// expo-updates' default behaviour downloads a new bundle at launch but only
// APPLIES it on the NEXT launch — so testers had to force-stop and reopen the
// app twice, and kept reporting bugs that were already fixed because they were
// still running the old bundle without knowing it.
//
// This hook makes the update visible and applies it on demand:
//   1. check + download in the background (never blocks the UI) ;
//   2. surface `ready` so the app can offer « Mettre à jour » ;
//   3. reloadAsync() applies it immediately — a single restart, done by us.
//
// It re-checks when the app comes back to the foreground, which is when a
// tester most often has a fresh build waiting. 3G-friendly: work happens in the
// background and a failure is silent (the default launch-time flow still
// applies the update eventually).

export function useAppUpdate() {
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  // Guards against overlapping checks (foreground event + initial mount).
  const busy = useRef(false);

  const check = useCallback(async () => {
    // Updates are disabled in Expo Go / dev clients — calling the API there
    // throws, so bail out early.
    if (__DEV__ || !Updates.isEnabled) return;
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        setReady(true);
      }
    } catch {
      // Offline / server unreachable — stay silent, retry on next foreground.
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const apply = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Reload failed — the update still applies on the next cold start.
      setApplying(false);
    }
  }, [applying]);

  return { ready, applying, apply };
}
