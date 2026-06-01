import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import {
  CalendarDays,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  CalendarClock,
  X,
  Check,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { mockProperties } from '../../../src/data/mockProperties';
import { photos } from '../../../src/data/photos';
import { formatGNF } from '../../../src/lib/format';
import { useAgentVisits } from '../../../src/data/queries/properties';

export default function VisitDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const property = mockProperties[0]!;
  // Status drives whether the post-acceptance action area renders.
  // The list-screen accept/reject buttons handle the pending decision; once
  // a visit is accepted, the agent comes here to mark it completed / reschedule
  // / cancel. For non-accepted statuses we hide the action area entirely.
  const { data: visits = [] } = useAgentVisits();
  const visit = visits.find((v) => v.id === id);
  const isAccepted = visit?.status === 'accepted';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader title="Visite" />

        {/* When */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              padding: 18,
              borderRadius: 22,
              backgroundColor: colors.primarySoft,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalendarDays size={22} color="#FFFFFF" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  letterSpacing: 0.5,
                  opacity: 0.75,
                }}
              >
                AUJOURD'HUI · 15 MAI
              </Text>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  marginTop: 4,
                  letterSpacing: -0.4,
                  fontVariant: ['tabular-nums'],
                  lineHeight: 30,
                  includeFontPadding: false,
                }}
              >
                14:30
              </Text>
            </View>
          </View>
        </View>

        {/* Client */}
        <Section title="Client">
          <View
            style={{
              padding: 14,
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
              source={photos.woman1}
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
              }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.text,
                  letterSpacing: 0,
                  lineHeight: 18,
                  includeFontPadding: false,
                }}
              >
                Mariama Diallo
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: 2,
                  letterSpacing: 0,
                  fontVariant: ['tabular-nums'],
                }}
              >
                +224 622 55 12 88
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <ContactButton Icon={Phone} label="Appeler" />
            <ContactButton Icon={MessageCircle} label="Message" />
          </View>
        </Section>

        {/* Property */}
        <Section title="Bien à visiter">
          <Pressable
            onPress={() => router.push(`/property/${property.id}`)}
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
              style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: colors.bgSunken }}
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
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.text,
                  marginTop: 4,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatGNF(property.priceGnf)}
                {property.perMonth && (
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' }}>
                    {' '}
                    /mois
                  </Text>
                )}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                }}
              >
                <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                <Text style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }}>
                  {property.district}, {property.city}
                </Text>
              </View>
            </View>
          </Pressable>
        </Section>

        {/* Actions — only for accepted visits. Pending decisions live on the list screen. */}
        {isAccepted && (
          <View style={{ paddingHorizontal: 24, paddingTop: 18, gap: 10 }}>
            <Pressable
              onPress={() => haptic.medium()}
              style={{
                height: 54,
                borderRadius: 16,
                backgroundColor: colors.text,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Check size={16} color={colors.bg} strokeWidth={2.25} />
              <Text
                style={{
                  fontSize: 14.5,
                  fontWeight: '700',
                  color: colors.bg,
                  lineHeight: 17,
                  includeFontPadding: false,
                }}
              >
                Marquer comme terminée
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => haptic.light()}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 16,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <CalendarClock size={14} color={colors.text} strokeWidth={2} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.text,
                    lineHeight: 16,
                    includeFontPadding: false,
                  }}
                >
                  Reporter
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptic.medium();
                  router.back();
                }}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 16,
                  backgroundColor: 'rgba(209,79,60,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(209,79,60,0.25)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <X size={14} color={colors.danger} strokeWidth={2} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.danger,
                    lineHeight: 16,
                    includeFontPadding: false,
                  }}
                >
                  Annuler
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: 22 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.textFaint,
          letterSpacing: 0.6,
          paddingHorizontal: 28,
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ paddingHorizontal: 24 }}>{children}</View>
    </View>
  );
}

function ContactButton({
  Icon,
  label,
}: {
  Icon: typeof Phone;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => haptic.light()}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 14,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Icon size={14} color={colors.text} strokeWidth={2} />
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: colors.text,
          lineHeight: 16,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
