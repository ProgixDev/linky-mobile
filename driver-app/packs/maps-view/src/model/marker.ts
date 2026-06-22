import { z } from 'zod';

export const MapMarkerSchema = z.object({
  id: z.string(),
  title: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type MapMarker = z.infer<typeof MapMarkerSchema>;

export type Coord = { lat: number; lng: number };
