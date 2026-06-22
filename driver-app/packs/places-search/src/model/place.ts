import { z } from 'zod';

/** A search result / picked place. Coordinates are ready to feed nav-turn-by-turn. */
export const PlaceSchema = z.object({
  id: z.string(),
  /** Full display label, e.g. "Eiffel Tower, Paris, France". */
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Place = z.infer<typeof PlaceSchema>;
