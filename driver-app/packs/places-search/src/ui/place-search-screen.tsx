import { FlatList, Pressable, View } from 'react-native';

import { AppText, Screen, TextField } from '@/shared/ui';

import { type Place } from '../model/place';
import { usePlaceSearch } from '../use-place-search';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder: type an
 * address, tap a result. Pass `onPick` to hand the {lat,lng} to nav or a map.
 */
export function PlaceSearchScreen({ onPick }: { onPick?: (place: Place) => void }) {
  const { query, setQuery, results, loading } = usePlaceSearch();
  return (
    <Screen>
      <View className="flex-1 gap-3">
        <AppText variant="display">Search a place</AppText>
        <TextField
          testID="places-input"
          className="flex-none"
          value={query}
          onChangeText={setQuery}
          placeholder="Address, city, landmark…"
          autoCapitalize="none"
        />
        {loading ? <AppText variant="caption">Searching…</AppText> : null}
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              testID={`places-result-${item.id}`}
              onPress={() => onPick?.(item)}
              className="border-b border-ink-faint/10 py-3"
            >
              <AppText variant="body">{item.label}</AppText>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}
