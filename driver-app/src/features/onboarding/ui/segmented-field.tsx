import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { AppText } from '@/shared/ui';

export interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedFieldProps {
  label: string;
  options: SegmentedOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Feature-prefixed; each option gets `${testID}-${value}`. */
  testID: string;
}

/**
 * A single-select chip row (vehicle type, oui/non). Tokenized + accessible; className
 * only (no inline styles). The selected chip uses the Linky brand emerald.
 */
export function SegmentedField({ label, options, value, onChange, testID }: SegmentedFieldProps) {
  return (
    <View className="gap-2" testID={testID}>
      <AppText variant="label">{label}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              testID={`${testID}-${opt.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(opt.value)}
              className={cn(
                'rounded-control border px-4 py-2',
                selected ? 'border-brand-600 bg-brand-600' : 'border-ink-faint/30 bg-surface-muted',
              )}
            >
              <AppText variant="label" className={cn(selected ? 'text-ink-inverse' : 'text-ink')}>
                {opt.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
