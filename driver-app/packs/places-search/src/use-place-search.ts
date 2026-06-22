import { useEffect, useRef, useState } from 'react';

import { searchPlaces } from './data/nominatim';
import { type Place } from './model/place';

/**
 * Debounced place search. Type into `query`; `results` updates ~400ms after the
 * last keystroke. In-flight requests are aborted so results never arrive out of
 * order, and the debounce respects Nominatim's ~1 req/sec public limit.
 */
export function usePlaceSearch(debounceMs = 400) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const found = await searchPlaces(q, controller.signal);
      if (!controller.signal.aborted) {
        setResults(found);
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return { query, setQuery, results, loading };
}
