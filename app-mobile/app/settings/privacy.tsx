import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Eye,
  Sparkles,
  BarChart3,
  Download,
  Trash2,
  Lock,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Switch } from '../../src/components/primitives/Switch';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';
import { usePrefs } from '../../src/stores/prefs';
import { useToast } from '../../src/components/feedback/Toast';

export default function PrivacyRoute() {
  const { colors } = useTheme();
  const toast = useToast();
  // Backed by the persisted prefs store (MMKV) so they survive an app reopen.
  const personalize = usePrefs((s) => s.privacyPersonalize);
  const setPersonalize = usePrefs((s) => s.setPrivacyPersonalize);
  const analytics = usePrefs((s) => s.privacyAnalytics);
  const setAnalytics = usePrefs((s) => s.setPrivacyAnalytics);
  const adTracking = usePrefs((s) => s.privacyAdTracking);
  const setAdTracking = usePrefs((s) => s.setPrivacyAdTracking);
  const profilePublic = usePrefs((s) => s.privacyProfilePublic);
  const setProfilePublic = usePrefs((s) => s.setPrivacyProfilePublic);

  // Phase Y.3 — "Supprimer mon compte" is a GDPR-required path with no V1
  // self-serve backend. We open a mailto request to support@linky.gn so the
  // user has a way to actually file the request, but we confirm first
  // (irreversible-feeling) and we tell them the truth: it's a manual support
  // workflow, not an automated 30-day countdown.
  const onDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      "On va ouvrir ton application mail pour envoyer une demande à notre équipe support. Ils confirmeront la suppression par retour de mail.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            Linking.openURL(
              'mailto:support@linky.gn?subject=' +
                encodeURIComponent('Demande de suppression de mon compte Linky'),
            ).catch(() => {
              toast.show('Impossible d\'ouvrir ton application mail.', 'danger');
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Confidentialité"
          subtitle="Tu décides ce que Linky peut faire de tes données."
        />

        <SectionLabel label="Données" />
        <Card>
          <ToggleRow
            Icon={Sparkles}
            label="Recommandations personnalisées"
            sub="Adapte ton feed Découvrir à tes goûts."
            value={personalize}
            onChange={setPersonalize}
          />
          <ToggleRow
            Icon={BarChart3}
            label="Statistiques anonymes"
            sub="Aide-nous à améliorer l'app avec des stats agrégées."
            value={analytics}
            onChange={setAnalytics}
          />
          <ToggleRow
            Icon={Eye}
            label="Pub personnalisée"
            sub="Reçois des promos plus pertinentes."
            value={adTracking}
            onChange={setAdTracking}
            last
          />
        </Card>

        <SectionLabel label="Profil" />
        <Card>
          <ToggleRow
            Icon={Lock}
            label="Profil public"
            sub="Les autres utilisateurs peuvent voir ton nom et tes annonces."
            value={profilePublic}
            onChange={setProfilePublic}
            last
          />
        </Card>

        {/* Phase Y.3 — "Télécharger mes données" has no V1 self-serve backend ;
            it's now an honest "Bientôt" row (no mailto, no fake "we sent you
            an email"). "Supprimer mon compte" stays actionable via support
            mail with an explicit confirm dialog — GDPR requires a path. */}
        <SectionLabel label="Mes données" />
        <Card>
          <ActionRow
            Icon={Download}
            label="Télécharger mes données"
            sub="Bientôt — pour l'instant, écris-nous à support@linky.gn."
            comingSoon
            onPress={() => toast.show('Bientôt disponible.', 'info')}
          />
          <ActionRow
            Icon={Trash2}
            label="Supprimer mon compte"
            sub="Demande à notre équipe la suppression définitive de ton compte."
            danger
            last
            onPress={onDeleteAccount}
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

function ToggleRow({
  Icon,
  label,
  sub,
  value,
  onChange,
  last,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
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
      <Switch value={value} onChange={onChange} />
    </View>
  );
}

function ActionRow({
  Icon,
  label,
  sub,
  danger,
  comingSoon,
  last,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  danger?: boolean;
  comingSoon?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const fg = comingSoon ? colors.textMuted : danger ? colors.danger : colors.text;
  return (
    <Pressable
      // Phase Y.3 — onPress wires to the caller's flow. Coming-soon rows tap
      // to a "Bientôt" toast ; danger rows go through a confirm dialog.
      onPress={() => { haptic.light(); onPress?.(); }}
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
          backgroundColor: danger ? 'rgba(209,79,60,0.10)' : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={fg} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              fontSize: 14.5,
              fontWeight: '600',
              color: fg,
              letterSpacing: 0,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {label}
          </Text>
          {comingSoon && (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: colors.accentSoft,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: '700',
                  color: colors.accentText,
                  letterSpacing: 0.4,
                }}
              >
                BIENTÔT
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
    </Pressable>
  );
}
