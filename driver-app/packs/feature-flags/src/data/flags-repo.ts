import { supabase } from '@/shared/lib/supabase';

import { FlagSchema, type Flag } from '../model/flag';

/** Fetch all flags (public read). Returns [] on failure (treat as all-off). */
export async function fetchFlags(): Promise<Flag[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled, rollout');
  if (error || !data) return [];
  return data.flatMap((row) => {
    const parsed = FlagSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
