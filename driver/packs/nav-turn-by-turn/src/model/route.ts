import { z } from 'zod';

export const CoordSchema = z.object({ lat: z.number(), lng: z.number() });
export type Coord = z.infer<typeof CoordSchema>;

export const RouteStepSchema = z.object({
  /** Human instruction, e.g. "Turn left onto Main Street". */
  instruction: z.string(),
  /** Where the maneuver happens. */
  location: CoordSchema,
  /** Metres of this step. */
  distance: z.number(),
});
export type RouteStep = z.infer<typeof RouteStepSchema>;

export const RouteSchema = z.object({
  /** Total metres. */
  distance: z.number(),
  /** Total seconds. */
  duration: z.number(),
  /** Full polyline for drawing the route line. */
  geometry: z.array(CoordSchema),
  steps: z.array(RouteStepSchema),
});
export type Route = z.infer<typeof RouteSchema>;
