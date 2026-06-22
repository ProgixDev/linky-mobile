import { useEffect, useRef, useState } from 'react';

import { searchContent } from './data/search-repo';
import { type SearchHit } from './model/result';

/**
 * Debounced ranked search. Type into `query`; `results` update ~300ms after the
 * last keystroke. A monotonically increasing request id drops stale responses so
 * results never arrive out of order.
 */
export function useSearch(debounceMs = 300) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      const hits = await searchContent(q);
      if (id === reqId.current) {
        setResults(hits);
        setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return { query, setQuery, results, loading };
}
