import { type Coord, type Route, type RouteStep } from './model/route';

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type NavProgress = {
  currentStep: RouteStep | null;
  /** Metres to the next maneuver. */
  distanceToNext: number;
  /** Approx metres to the destination. */
  remainingDistance: number;
  arrived: boolean;
};

const ARRIVE_RADIUS = 25; // metres

/**
 * The turn-by-turn engine: given the live position and the route, work out which
 * instruction to show and how far the next maneuver is. Deliberately simple
 * (nearest-maneuver heuristic) — good enough for a starter; swap for snapping if
 * you need lane-level accuracy.
 */
export function computeProgress(position: Coord, route: Route): NavProgress {
  const steps = route.steps;
  if (steps.length === 0) {
    return { currentStep: null, distanceToNext: 0, remainingDistance: 0, arrived: true };
  }

  let nearestIdx = 0;
  let nearest = Infinity;
  steps.forEach((s, i) => {
    const d = distanceMeters(position, s.location);
    if (d < nearest) {
      nearest = d;
      nearestIdx = i;
    }
  });

  // If we've reached the nearest maneuver, show the one after it.
  const stepIndex =
    nearest < ARRIVE_RADIUS ? Math.min(nearestIdx + 1, steps.length - 1) : nearestIdx;
  const currentStep = steps[stepIndex] ?? null;
  const distanceToNext = currentStep ? distanceMeters(position, currentStep.location) : 0;

  const last = steps[steps.length - 1];
  const remainingDistance = last ? distanceMeters(position, last.location) : 0;

  return {
    currentStep,
    distanceToNext,
    remainingDistance,
    arrived: remainingDistance < ARRIVE_RADIUS,
  };
}
