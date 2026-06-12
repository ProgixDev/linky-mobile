import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mail,
  Phone,
  ChevronRight,
  HelpCircle,
  ShieldCheck,
  Activity,
  CircleAlert,
  CheckCircle2,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Comment fonctionne le paiement sécurisé ?',
    a: 'On garde l\'argent en escrow jusqu\'à confirmation de la réception.',
  },
  {
    q: 'Que faire en cas de litige avec un vendeur ?',
    a: 'Ouvre un litige depuis la commande. Un médiateur Linky intervient sous 48 h.',
  },
  {
    q: 'Comment devenir vendeur vérifié ?',
    a: 'Va dans Profil → Vérification d\'identité et suis les 3 étapes.',
  },
  {
    q: 'Les paiements en euros sont-ils disponibles ?',
    a: 'Oui, avec une carte bancaire pour la diaspora. GNF reste la devise principale.',
  },
];

export default function HelpRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Aide & support"
          subtitle="On t'aide à utiliser Linky en toute sérénité."
        />

        {/* Status banner */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.primarySoft,
              borderWidth: 1,
              borderColor: 'rgba(15,114,86,0.18)',
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={14} color="#FFFFFF" strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  letterSpacing: 0,
                  lineHeight: 16,
                  includeFontPadding: false,
                }}
              >
                Tous les services sont opérationnels
              </Text>
              <Text
                style={{
                  fontSize: 11.5,
                  color: colors.primaryDeep,
                  marginTop: 2,
                  letterSpacing: 0,
                  lineHeight: 14,
                  opacity: 0.75,
                }}
              >
                Mis à jour il y a 2 min · linky.gn/status
              </Text>
            </View>
          </View>
        </View>

        {/* Phase X.7 — "Chat avec l'équipe" with its fake "En ligne" badge
            removed (no live-chat backend exists in V1 — the badge actively
            lied). Email + Appeler stay because both already openURL into
            the OS app. */}
        <SectionLabel label="Nous contacter" />
        <Card>
          <ContactRow
            Icon={Mail}
            label="Envoyer un email"
            sub="support@linky.gn"
            onPress={() => Linking.openURL('mailto:support@linky.gn').catch(() => {})}
          />
          <ContactRow
            Icon={Phone}
            label="Appeler"
            sub="+224 622 00 00 00"
            onPress={() => Linking.openURL('tel:+224622000000').catch(() => {})}
            last
          />
        </Card>

        <SectionLabel label="Questions fréquentes" />
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

        <SectionLabel label="Aide approfondie" />
        <Card>
          {/* Phase X.7 — wired to dedicated support mailboxes. */}
          <ContactRow
            Icon={ShieldCheck}
            label="Signaler un problème de sécurité"
            sub="Compte piraté, fraude, contenu inapproprié."
            onPress={() =>
              Linking.openURL(
                'mailto:security@linky.gn?subject=' +
                  encodeURIComponent('Signalement sécurité Linky'),
              ).catch(() => {})
            }
          />
          <ContactRow
            Icon={CircleAlert}
            label="Signaler un bug"
            sub="Décris-nous ce qui ne marche pas."
            onPress={() =>
              Linking.openURL(
                'mailto:support@linky.gn?subject=' +
                  encodeURIComponent('Bug Linky'),
              ).catch(() => {})
            }
          />
          <ContactRow
            Icon={Activity}
            label="Page de statut"
            sub="Voir l'état des services en temps réel."
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
