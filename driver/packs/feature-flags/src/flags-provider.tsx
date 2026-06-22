import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { appStorage } from '@/shared/lib/storage';
import { supabase } from '@/shared/lib/supabase';

import { fetchFlags } from './data/flags-repo';
import { isFlagOn, type Flag } from './model/flag';

const CACHE_KEY = 'flags.cache';

type FlagsValue = { ready: boolean; isOn: (key: string) => boolean };
const FlagsContext = createContext<FlagsValue>({ ready: false, isOn: () => false });

/**
 * Loads flags once, caches them (so the next cold start evaluates instantly and
 * works offline), then refreshes from the network. Rollout is evaluated against
 * the current user id for stable bucketing.
 */
export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const cached = await appStorage.get(CACHE_KEY);
      if (cached) {
        try {
          setFlags(JSON.parse(cached) as Flag[]);
        } catch {
          /* ignore corrupt cache */
        }
      }
      setUserId((await supabase.auth.getUser()).data.user?.id ?? null);
      setReady(true);

      const fresh = await fetchFlags();
      if (fresh.length > 0) {
        setFlags(fresh);
        await appStorage.set(CACHE_KEY, JSON.stringify(fresh));
      }
    })();
  }, []);

  const isOn = (key: string): boolean => {
    const flag = flags.find((f) => f.key === key);
    return flag ? isFlagOn(flag, userId) : false;
  };

  return <FlagsContext.Provider value={{ ready, isOn }}>{children}</FlagsContext.Provider>;
}

/** `const showNewCheckout = useFlag('new_checkout');` */
export function useFlag(key: string): boolean {
  return useContext(FlagsContext).isOn(key);
}

/** Whether flags have loaded at least from cache (gate first paint if you must). */
export function useFlagsReady(): boolean {
  return useContext(FlagsContext).ready;
}
