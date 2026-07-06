// Minimal month calendar for the booking wizard — no date library in the app,
// so everything is integer y/m/d math over 'YYYY-MM-DD' strings (Guinea is
// UTC+0 ; no timezone gymnastics needed).
// mode 'range'  : daily stays — first tap sets check-in, second sets check-out.
// mode 'single' : monthly leases — one tap sets the move-in date.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function iso(y: number, m: number, d: number): string { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayIso(): string {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

export function BookingCalendar({
  mode,
  startDate,
  endDate,
  onChange,
  maxAheadDays = 180,
}: {
  mode: 'range' | 'single';
  startDate: string | null;
  endDate: string | null;
  onChange: (start: string | null, end: string | null) => void;
  maxAheadDays?: number;
}) {
  const { colors, radii } = useTheme();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const today = todayIso();
  const maxDate = useMemo(() => {
    const d = new Date(now.getTime() + maxAheadDays * 86_400_000);
    return iso(d.getFullYear(), d.getMonth(), d.getDate());
  }, [maxAheadDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the 7-column grid: leading blanks (Monday-first) + the month's days.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(viewYear, viewMonth, 1));
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // 0=Monday
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(iso(viewYear, viewMonth, d));
    return out;
  }, [viewYear, viewMonth]);

  const canGoPrev = viewYear > now.getFullYear() || viewMonth > now.getMonth();

  const onDayPress = (day: string) => {
    haptic.selection();
    if (mode === 'single') {
      onChange(day, null);
      return;
    }
    // range: no start OR both set OR tapped before start → restart
    if (!startDate || (startDate && endDate) || day <= startDate) {
      onChange(day, null);
    } else {
      onChange(startDate, day);
    }
  };

  return (
    <View
      style={{
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      {/* Month header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable
          disabled={!canGoPrev}
          hitSlop={8}
          onPress={() => {
            haptic.selection();
            if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
            else setViewMonth(viewMonth - 1);
          }}
          style={{ opacity: canGoPrev ? 1 : 0.3, padding: 4 }}
        >
          <ChevronLeft size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '700' }}>
          {MONTHS_FR[viewMonth]} {viewYear}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() => {
            haptic.selection();
            if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
            else setViewMonth(viewMonth + 1);
          }}
          style={{ padding: 4 }}
        >
          <ChevronRight size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View style={{ flexDirection: 'row' }}>
        {DAYS_FR.map((d, i) => (
          <View key={`${d}-${i}`} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text variant="micro" tone="faint" style={{ letterSpacing: 0 }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`b-${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const disabled = day < today || day > maxDate;
          const isStart = day === startDate;
          const isEnd = day === endDate;
          const inRange = !!startDate && !!endDate && day > startDate && day < endDate;
          const selected = isStart || isEnd;
          return (
            <Pressable
              key={day}
              disabled={disabled}
              onPress={() => onDayPress(day)}
              style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.primary : inRange ? colors.primarySoft : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: selected ? '700' : '500',
                    color: disabled ? colors.textFaint : selected ? '#FFFFFF' : inRange ? colors.primaryDeep : colors.text,
                  }}
                >
                  {Number(day.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
