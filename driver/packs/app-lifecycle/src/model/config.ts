import { z } from 'zod';

export const AppConfigSchema = z.object({
  min_supported_build: z.number().int(),
  latest_build: z.number().int(),
  maintenance: z.boolean(),
  maintenance_message: z.string().nullable(),
  ios_store_url: z.string().nullable(),
  android_store_url: z.string().nullable(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export type GateStatus = 'ok' | 'update-required' | 'update-available' | 'maintenance';
