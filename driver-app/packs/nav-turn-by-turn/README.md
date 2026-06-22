# Pack: nav-turn-by-turn

Turn-by-turn navigation — live location, routing, and a turn-by-turn instruction engine — with
**no map API key**. Routing uses the free public **OSRM** server. Logic-first; UI is a text placeholder.

## What you get

- `data/osrm.ts` — `getRoute(from, to, profile)` → `{ distance, duration, geometry, steps }`, with
  each step's maneuver turned into a human instruction (e.g. "Turn left onto Main Street"). Never throws.
- `nav-engine.ts` — `computeProgress(position, route)` → the current instruction, metres to the next
  maneuver, remaining distance, and `arrived`. Plus `distanceMeters` (haversine).
- `useNavigation(destination)` — watches the device location (expo-location), fetches the route, and
  recomputes progress as you move → `{ position, route, progress, error }`.
- `NavScreen` — a **placeholder** that shows the live instruction + ETA as text.

## Install

```
/add-feature nav-turn-by-turn
npx expo install expo-location           # required
npx expo install react-native-maps       # OPTIONAL — only to draw the map
```

Add a **tailored** location usage string (store-readiness requires it):

```ts
// app.config.ts → ios.infoPlist
NSLocationWhenInUseUsageDescription: 'Show your position and guide you to your destination.';
```

Use it:

```ts
<NavScreen destination={{ lat: 48.8584, lng: 2.2945 }} />
// or headless:
const { progress } = useNavigation(destination); // progress.currentStep.instruction
```

## Production note

The public OSRM demo (`router.project-osrm.org`) is rate-limited and dev-only. For production,
**self-host OSRM** (free, open-source) or swap `data/osrm.ts` for Mapbox/Google Directions (keys).
The engine, hook, and UI stay the same — only the routing source changes.

## Map

`react-native-maps` is optional and unkeyed on iOS (Apple Maps) / requires a Google key on Android.
Draw `route.geometry` as a polyline and `position` as the user marker in the design pass.
