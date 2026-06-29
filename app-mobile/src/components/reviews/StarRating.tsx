// Star rating — an interactive input (tap 1–5) and a small read-only display, both
// following the existing shop-page star pattern (lucide Star, accent fill).
import { Pressable, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function StarRating({
  value,
  onChange,
  size = 38,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}
          accessibilityState={{ selected: n <= value }}
        >
          <Star
            size={size}
            color={colors.accent}
            fill={n <= value ? colors.accent : 'transparent'}
            strokeWidth={1.5}
          />
        </Pressable>
      ))}
    </View>
  );
}

export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={size}
          color={i < Math.round(rating) ? colors.accent : colors.border}
          fill={i < Math.round(rating) ? colors.accent : 'transparent'}
        />
      ))}
    </View>
  );
}
