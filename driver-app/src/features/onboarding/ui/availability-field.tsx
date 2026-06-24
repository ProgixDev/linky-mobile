import { Clock, Minus, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

import {
  DAYS,
  PRESETS,
  serializeAvailability,
  shiftTime,
  type Availability,
  type AvailabilityPreset,
  type DayKey,
} from '../lib/availability';

const DEFAULT: Availability = { days: [], start: '08:00', end: '18:00' };

/**
 * Availability picker — multi-select days + working-hours window. Hours are set in
 * one tap via presets (Journée / Matinée / Soirée / Flexible) or fine-tuned with
 * « Personnalisé » steppers (±30 min). On-brand green, large readable numerals, a
 * live human summary. A11y-first: every control is a labelled Pressable/stepper,
 * fully usable without motion (no animation dependency). Serializes via lib/availability.
 */
export function AvailabilityField({
  value,
  custom,
  onCustomChange,
  onChange,
  testID = 'onboarding-availability',
}: {
  value: Availability | null;
  /** Whether the custom (stepper) path is open — lifted so the form can persist it. */
  custom: boolean;
  onCustomChange: (custom: boolean) => void;
  onChange: (a: Availability) => void;
  testID?: string;
}) {
  const days = value?.days ?? DEFAULT.days;
  const start = value?.start ?? DEFAULT.start;
  const end = value?.end ?? DEFAULT.end;

  const emit = (next: Partial<Availability>) => onChange({ days, start, end, ...next });

  const toggleDay = (k: DayKey) =>
    emit({ days: days.includes(k) ? days.filter((d) => d !== k) : [...days, k] });

  const applyPreset = (p: AvailabilityPreset) => {
    onCustomChange(false);
    emit({ start: p.start, end: p.end });
  };

  const activePreset = !custom
    ? PRESETS.find((p) => p.start === start && p.end === end)
    : undefined;
  const summary = serializeAvailability({ days, start, end });

  return (
    <View testID={testID} className="gap-3">
      {/* Live summary */}
      <View className="flex-row items-center gap-2 rounded-control bg-brand-50 px-3 py-2.5">
        <Clock size={16} color={colors.brand600} strokeWidth={2.25} />
        <AppText
          variant="label"
          className="flex-1 text-brand-700"
          testID="onboarding-availability-summary"
        >
          {summary || 'Choisis tes jours et tes horaires'}
        </AppText>
      </View>

      {/* Days */}
      <AppText variant="caption" className="text-ink-muted">
        Jours de travail
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        {DAYS.map((d) => {
          const on = days.includes(d.key);
          return (
            <Pressable
              key={d.key}
              testID={`onboarding-day-${d.key}`}
              accessibilityRole="button"
              accessibilityLabel={d.label}
              accessibilityState={{ selected: on }}
              onPress={() => toggleDay(d.key)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full',
                on ? 'bg-brand-600' : 'bg-surface-muted',
              )}
            >
              <AppText
                variant="caption"
                className={cn('font-sans-semibold', on ? 'text-ink-inverse' : 'text-ink-muted')}
              >
                {d.chip}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Hours — presets + custom */}
      <AppText variant="caption" className="text-ink-muted">
        Horaires
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((p) => {
          const on = activePreset?.key === p.key;
          return (
            <Pressable
              key={p.key}
              testID={`onboarding-preset-${p.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => applyPreset(p)}
              className={cn('rounded-full px-3.5 py-2', on ? 'bg-brand-600' : 'bg-surface-muted')}
            >
              <AppText
                variant="caption"
                className={cn('font-sans-medium', on ? 'text-ink-inverse' : 'text-ink-muted')}
              >
                {p.label}
              </AppText>
            </Pressable>
          );
        })}
        <Pressable
          testID="onboarding-preset-custom"
          accessibilityRole="button"
          accessibilityState={{ selected: custom }}
          onPress={() => onCustomChange(true)}
          className={cn('rounded-full px-3.5 py-2', custom ? 'bg-brand-600' : 'bg-surface-muted')}
        >
          <AppText
            variant="caption"
            className={cn('font-sans-medium', custom ? 'text-ink-inverse' : 'text-ink-muted')}
          >
            Personnalisé
          </AppText>
        </Pressable>
      </View>

      {custom ? (
        <View className="gap-2">
          <View className="flex-row gap-3">
            <TimeStepper
              label="Début"
              value={start}
              testID="onboarding-time-start"
              onChange={(t) => emit({ start: t })}
            />
            <TimeStepper
              label="Fin"
              value={end}
              testID="onboarding-time-end"
              onChange={(t) => emit({ end: t })}
            />
          </View>
          {start >= end ? (
            <AppText
              variant="caption"
              className="text-danger"
              testID="onboarding-availability-error"
            >
              L’heure de fin doit être après le début.
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function TimeStepper({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  testID: string;
}) {
  return (
    <View className="flex-1 items-center gap-2 rounded-control bg-surface-muted p-3">
      <AppText variant="caption" className="text-ink-muted">
        {label}
      </AppText>
      <View className="flex-row items-center gap-3">
        <Pressable
          testID={`${testID}-minus`}
          accessibilityRole="button"
          accessibilityLabel={`${label} moins 30 minutes`}
          onPress={() => onChange(shiftTime(value, -30))}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Minus size={16} color={colors.ink} strokeWidth={2.5} />
        </Pressable>
        <AppText variant="title" testID={testID} className="w-16 text-center">
          {value}
        </AppText>
        <Pressable
          testID={`${testID}-plus`}
          accessibilityRole="button"
          accessibilityLabel={`${label} plus 30 minutes`}
          onPress={() => onChange(shiftTime(value, 30))}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Plus size={16} color={colors.ink} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}
