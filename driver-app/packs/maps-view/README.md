# Pack: maps-view

A map screen with markers plus a **key-free "nearby" query** over any table that has numeric
`lat`/`lng` columns — no PostGIS. Completes the location trio: `places-search` (find an address) →
`maps-view` (show it) → `nav-turn-by-turn` (route there). Logic-first; UI is a placeholder.

## What you get

- `nearby.ts` — `fetchNearby({ table, center, radiusKm })`: a cheap lat/lng **bounding-box** filter in
  SQL (uses a normal index), refined and sorted by exact **haversine** distance on the client. Plus
  `distanceKm(a, b)`.
- `useNearby(table, center, radiusKm)` — re-queries as the center/radius changes (map panning).
- `MapScreen` — **placeholder** `react-native-maps` view with markers + `onSelect`.
- `model/marker.ts` — `MapMarker` Zod schema.

## Install

```
/add-feature maps-view
npx expo install react-native-maps
```

Use it:

```tsx
const { markers } = useNearby('places', userCoord, 5);
<MapScreen center={userCoord} markers={markers} onSelect={(m) => router.push(`/place/${m.id}`)} />
```

## Notes

iOS uses **Apple Maps** (no key). Android uses **Google Maps** — add a Maps SDK key in `app.config.ts`
only when you ship a standalone Android build. The bounding-box approach is great to a few thousand
rows; for planet-scale, swap `fetchNearby` for a **PostGIS** `ST_DWithin` RPC behind the same
`MapMarker` shape — the screen and hook don't change. Whatever table you query is still protected by
its own RLS.
