import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mail,
  ChevronRight,
  HelpCircle,
  ShieldCheck,
  Activity,
  CircleAlert,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';

// Phase I.9 — stable defs ; the visible label is resolved at render time
// via t() so the FAQ flips language with Langue.
const FAQ_DEFS: { qKey: string; aKey: string }[] = [
  { qKey: 'helpScreen.faq1Q', aKey: 'helpScreen.faq1A' },
  { qKey: 'helpScreen.faq2Q', aKey: 'helpScreen.faq2A' },
  { qKey: 'helpScreen.faq3Q', aKey: 'helpScreen.faq3A' },
  { qKey: 'helpScreen.faq4Q', aKey: 'helpScreen.faq4A' },
];

export default function HelpRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const FAQ = useMemo(
    () => FAQ_DEFS.map((d) => ({ q: t(d.qKey), a: t(d.aKey) })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('helpScreen.topbar')}
          subtitle={t('helpScreen.subtitle')}
        />

        {/* Phase X.7 — "Chat avec l'équipe" with its fake "En ligne" badge
            removed (no live-chat backend exists in V1 — the badge actively
            lied). Email + Appeler stay because both already openURL into
            the OS app. */}
        {/* "Appeler" row removed — it dialed a placeholder number
            (+224 622 00 00 00) that reaches nothing. Email is the real channel. */}
        <SectionLabel label={t('helpScreen.sectionContact')} />
        <Card>
          <ContactRow
            Icon={Mail}
            label={t('helpScreen.emailLabel')}
            sub={t('helpScreen.emailSub')}
            onPress={() => Linking.openURL('mailto:support@linky.gn').catch(() => {})}
            last
          />
        </Card>

        <SectionLabel label={t('helpScreen.sectionFaq')} />
        <Card>
          {FAQ.map((item, idx) => (
            <FaqRow
              key={item.q}
              question={item.q}
              answer={item.a}
              last={idx === FAQ.length - 1}
            />
          ))}
        </Card>

        <SectionLabel label={t('helpScreen.sectionDeep')} />
        <Card>
          {/* Phase X.7 — wired to dedicated support mailboxes. */}
          <ContactRow
            Icon={ShieldCheck}
            label={t('helpScreen.securityLabel')}
            sub={t('helpScreen.securitySub')}
            onPress={() =>
              Linking.openURL(
                'mailto:security@linky.gn?subject=' +
                  encodeURIComponent(t('helpScreen.securitySubject')),
              ).catch(() => {})
            }
          />
          <ContactRow
            Icon={CircleAlert}
            label={t('helpScreen.bugLabel')}
            sub={t('helpScreen.bugSub')}
            onPress={() =>
              Linking.openURL(
                'mailto:support@linky.gn?subject=' +
                  encodeURIComponent(t('helpScreen.bugSubject')),
              ).catch(() => {})
            }
          />
          <ContactRow
            Icon={Activity}
            label={t('helpScreen.statusLabel')}
            sub={t('helpScreen.statusSub')}
            onPress={() => Linking.openURL('https://linky.gn/status').catch(() => {})}
            last
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===================================================================

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: colors.textFaint,
        letterSpacing: 0.6,
        paddingHorizontal: 28,
        marginTop: 22,
        marginBottom: 10,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 24,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function ContactRow({
  Icon,
  label,
  sub,
  onPress,
  badge,
  badgeAccent,
  last,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  onPress: () => void;
  badge?: string;
  badgeAccent?: 'success';
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={colors.text} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: '600',
              color: colors.text,
              letterSpacing: 0,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {label}
          </Text>
          {badge && (
            <View
              style={{
                paddingHorizontal: 7,
                height: 18,
                borderRadius: 999,
                backgroundColor:
                  badgeAccent === 'success' ? 'rgba(34,168,113,0.16)' : colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: badgeAccent === 'success' ? colors.success : colors.textMuted,
                }}
              />
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: '700',
                  color: badgeAccent === 'success' ? colors.success : colors.textMuted,
                  lineHeight: 11,
                  includeFontPadding: false,
                  letterSpacing: 0.3,
                }}
              >
                {badge.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
            letterSpacing: 0,
            lineHeight: 16,
          }}
        >
          {sub}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

function FaqRow({ question, answer, last }: { question: string; answer: string; last?: boolean }) {
  const { colors } = useTheme();
  // Phase X.7 — both question and answer are always rendered, so the
  // Pressable wrapper with haptic-only onPress added nothing. View.
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <HelpCircle size={14} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: colors.text,
            letterSpacing: 0,
            lineHeight: 19,
            includeFontPadding: false,
          }}
        >
          {question}
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            color: colors.textMuted,
            marginTop: 3,
            letterSpacing: 0,
            lineHeight: 18,
          }}
        >
          {answer}
        </Text>
      </View>
    </View>
  );
}
