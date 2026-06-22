import { supabase } from '@/shared/lib/supabase';

import { AppConfigSchema, type AppConfig } from '../model/config';

/** Fetch the single public app_config row. Returns null on failure (fail open). */
export async function fetchAppConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('min_supported_build, latest_build, maintenance, maintenance_message, ios_store_url, android_store_url')
    .eq('id', true)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = AppConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
