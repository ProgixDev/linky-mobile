import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

import { SCREENING_QUESTIONS, type ScreeningKey } from '../lib/screening';

/**
 * Character screening — one single-select card list per question. Tasteful (not a
 * plain radio): selected option gets a green border + check. Values flow up via
 * onSelect(questionId, optionValue); the parent stores them under answers.screening.
 */
export function ScreeningField({
  value,
  onSelect,
  disabled,
}: {
  value: Partial<Record<ScreeningKey, string>>;
  onSelect: (id: ScreeningKey, optionValue: string) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-6" testID="onboarding-screening">
      {SCREENING_QUESTIONS.map((q) => (
        <View key={q.id} className="gap-2">
          <AppText variant="caption" className="font-sans-semibold text-brand-600">
            {q.theme}
          </AppText>
          <AppText variant="label">{q.question}</AppText>
          <View className="gap-2">
            {q.options.map((o) => {
              const on = value[q.id] === o.value;
              return (
                <Pressable
                  key={o.value}
                  testID={`screening-${q.id}-${o.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: !!disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(q.id, o.value)}
                  className={cn(
                    'flex-row items-center gap-3 rounded-card border p-3.5',
                    on ? 'border-brand-500 bg-brand-50' : 'border-ink-faint/20 bg-surface',
                  )}
                >
                  <View
                    className={cn(
                      'h-5 w-5 items-center justify-center rounded-full border-2',
                      on ? 'border-brand-600 bg-brand-600' : 'border-ink-faint',
                    )}
                  >
                    {on ? <Check size={12} color={colors.surface} strokeWidth={3} /> : null}
                  </View>
                  <AppText className={cn('flex-1', on ? 'text-brand-700' : 'text-ink')}>
                    {o.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
