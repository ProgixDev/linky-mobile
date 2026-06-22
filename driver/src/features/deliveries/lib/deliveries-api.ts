import { supabase } from '@/shared/lib/supabase';

import { DeliveryListSchema, type Delivery } from '../model/schema';

/**
 * Fetch the signed-in driver's active deliveries from the edge function.
 *
 * The request carries NO driver identity — `functions.invoke` attaches the
 * session JWT automatically and the function derives `livreur_id` from it
 * (spec 001 AC-9). The response is Zod-validated at this network edge.
 */
export async function fetchDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase.functions.invoke('list-livreur-deliveries', {
    method: 'POST',
  });

  if (error) {
    throw new Error(error.message ?? 'Could not load deliveries');
  }

  const parsed = DeliveryListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Unexpected deliveries response');
  }

  return parsed.data;
}
