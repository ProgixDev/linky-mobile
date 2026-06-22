import { supabase } from '@/shared/lib/supabase';

import { SearchHitSchema, type SearchHit } from '../model/result';

/**
 * Ranked full-text search via the search_documents() RPC. Returns [] for short
 * or empty queries and on error (never throws). websearch_to_tsquery on the
 * server means users can type natural queries ("red shoes -leather").
 */
export async function searchContent(query: string, maxResults = 20): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_documents', { q, max_results: maxResults });
  if (error || !data) return [];
  return (data as unknown[]).flatMap((row) => {
    const parsed = SearchHitSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
