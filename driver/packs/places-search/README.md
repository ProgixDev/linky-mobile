# Pack: places-search

Address / place autocomplete and reverse geocoding over **free OpenStreetMap Nominatim** — no API
keys. Logic-first; UI is a placeholder.

## What you get

- `data/nominatim.ts` — `searchPlaces(query)` (forward search, never throws) and
  `reverseGeocode(lat, lng)` (coords → label).
- `usePlaceSearch` — debounced (~400ms) search with in-flight request cancellation so results
  never arrive out of order.
- `model/place.ts` — `Place` Zod schema; coordinates feed straight into `nav-turn-by-turn`.
- `PlaceSearchScreen` — **placeholder**: type an address, tap a result (`onPick`).

## Install

```
/add-feature places-search
```

No native modules, no key. Use it:

```tsx
<PlaceSearchScreen onPick={(p) => router.push(`/nav?lat=${p.lat}&lng=${p.lng}`)} />
// or headless:
const { query, setQuery, results } = usePlaceSearch();
```

## Limits & swapping the provider

Nominatim's **public** server allows ~1 request/second and asks clients to send a `User-Agent`
(set to the pack's name; change it to your app on ship). For production volume either **self-host**
Nominatim or replace `data/nominatim.ts` with a keyed provider (Google Places, Mapbox) behind the
same `Place` model — `usePlaceSearch` and the screen don't change. Provider keys, if used, are
**server-side only** (proxy through a route), never in `EXPO_PUBLIC_*`.
