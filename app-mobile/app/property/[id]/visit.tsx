import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import {
  CalendarDays,
  Clock,
  Check,
  MapPin,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useProperty, useRequestVisit } from '../../../src/data/queries/properties';
import { formatGNF } from '../../../src/lib/format';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';

const DAYS = [
  { id: 'today',    label: 'Aujourd\'hui',  offset: 0 },
  { id: 'tomorrow', label: 'Demain',        offset: 1 },
  { id: 'd3',       label: 'Après-demain',  offset: 2 },
  { id: 'd4',       label: '+3 jours',      offset: 3 },
];

const SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30'];

function dateForOffset(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '');
}

export default function VisitRequestRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isLoading, isError, refetch } = useProperty(id);
  const requestVisit = useRequestVisit();
  const toast = useToast();

  const [dayId, setDayId] = useState('tomorrow');
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const valid = !!slot && !!property;

  if (isLoading || isError || !property) {
    return <DetailStateScreen loading={isLoading} title="Visite" onRetry={() => void refetch()} />;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader
          title="Demander une visite"
          subtitle="Propose un créneau, l'agent te confirme rapidement."
        />

        {/* Property preview */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              padding: 12,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Image
              source={property.photos[0]}
              style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgSunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text,
                  letterSpacing: 0,
                  lineHeight: 18,
                  includeFontPadding: false,
                }}
                numberOfLines={2}
              >
                {property.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
                  {property.district}, {property.city}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.text,
                  marginTop: 4,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatGNF(property.priceGnf)}
                {property.perMonth && <Text style={{ fontWeight: '500', color: colors.textMuted }}> /mois</Text>}
              </Text>
            </View>
          </View>
        </View>

        {/* Day selector */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            JOUR
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {DAYS.map((d) => {
              const active = dayId === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    haptic.selection();
                    setDayId(d.id);
                  }}
                  style={{
                    width: 96,
                    paddingVertical: 14,
                    borderRadius: 16,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.text : colors.border,
                    backgroundColor: active ? colors.text : colors.card,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: '700',
                      color: active ? 'rgba(255,255,255,0.7)' : colors.textFaint,
                      letterSpacing: 0.5,
                    }}
                  >
                    {d.label.toUpperCase()}
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: active ? colors.bg : colors.text,
                      marginTop: 4,
                      letterSpacing: -0.2,
                      lineHeight: 22,
                      includeFontPadding: false,
                    }}
                  >
                    {formatDayLabel(dateForOffset(d.offset))}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Slot grid */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            CRÉNEAU
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SLOTS.map((s) => {
              const active = slot === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    haptic.selection();
                    setSlot(s);
                  }}
                  style={{
                    flexBasis: '30%',
                    flexGrow: 1,
                    height: 46,
                    borderRadius: 14,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primarySoft : colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: active ? colors.primaryDeep : colors.text,
                      fontVariant: ['tabular-nums'],
                      letterSpacing: 0,
                      lineHeight: 17,
                      includeFontPadding: false,
                    }}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Note */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            MESSAGE · OPTIONNEL
          </Text>
          <View
            style={{
              minHeight: 100,
              padding: 14,
              borderRadius: 16,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Précise ton besoin (durée du bail, nombre de personnes…)"
              placeholderTextColor={colors.textFaint}
              multiline
              textAlignVertical="top"
              style={{
                fontSize: 14,
                color: colors.text,
                lineHeight: 20,
                letterSpacing: 0,
                padding: 0,
                minHeight: 72,
              }}
            />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          disabled={!valid || requestVisit.isPending}
          onPress={async () => {
            if (!valid || !property || !slot) return;
            try {
              haptic.medium();
              const day = DAYS.find((d) => d.id === dayId)!;
              const target = dateForOffset(day.offset);
              const [h, m] = slot.split(':').map(Number);
              target.setHours(h, m, 0, 0);
              await requestVisit.mutateAsync({
                property_id: property.id,
                requested_at: target.toISOString(),
                note: note.trim() || undefined,
              });
              toast.show('Demande envoyée 🎉', 'success');
              router.replace('/buyer/requests');
            } catch (e: unknown) {
              console.error('[request-visit] error:', e);
              toast.show(toToastMessage(e, 'Envoi impossible'), 'danger');
            }
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: valid ? colors.text : colors.bgSunken,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: !valid || requestVisit.isPending ? 0.6 : 1,
          }}
        >
          <CalendarDays
            size={16}
            color={valid ? colors.bg : colors.textFaint}
            strokeWidth={2.25}
          />
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: valid ? colors.bg : colors.textFaint,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {requestVisit.isPending ? 'Envoi…' : 'Envoyer la demande'}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}
