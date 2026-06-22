import { FlatList, Pressable, View } from 'react-native';

import { AppText, Screen, TextField } from '@/shared/ui';

import { type SearchHit } from '../model/result';
import { useSearch } from '../use-search';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder search:
 * debounced ranked results. Pass `onOpen` to route on a hit (kind + ref_id).
 */
export function SearchScreen({ onOpen }: { onOpen?: (hit: SearchHit) => void }) {
  const { query, setQuery, results, loading } = useSearch();
  return (
    <Screen>
      <View className="flex-1 gap-3">
        <AppText variant="display">Search</AppText>
        <TextField
          testID="search-input"
          className="flex-none"
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
          autoCapitalize="none"
        />
        {loading ? <AppText variant="caption">Searching…</AppText> : null}
        <FlatList
          data={results}
          keyExtractor={(h) => h.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              testID={`search-hit-${item.id}`}
              onPress={() => onOpen?.(item)}
              className="border-b border-ink-faint/10 py-3"
            >
              <AppText variant="body">{item.title}</AppText>
              <AppText variant="caption" className="text-ink-faint">
                {item.kind}
              </AppText>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}
