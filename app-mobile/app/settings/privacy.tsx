import { Linking, Pressable, ScrollView, View } from 'react-native';
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

export default function PrivacyRoute() {
  const { colors } = useTheme();
  // Backed by the persisted prefs store (MMKV) so they survive an app reopen.
  const personalize = usePrefs((s) => s.privacyPersonalize);
  const setPersonalize = usePrefs((s) => s.setPrivacyPersonalize);
  const analytics = usePrefs((s) => s.privacyAnalytics);
  const setAnalytics = usePrefs((s) => s.setPrivacyAnalytics);
  const adTracking = usePrefs((s) => s.privacyAdTracking);
  const setAdTracking = usePrefs((s) => s.setPrivacyAdTracking);
  const profilePublic = usePrefs((s) => s.privacyProfilePublic);
  const setProfilePublic = usePrefs((s) => s.setPrivacyProfilePublic);

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

        {/* Phase X.7 — both rows now open the OS mail client with a
            pre-filled subject so the support team can process the
            GDPR request. No V1 self-serve flow exists ; the
            email-based workflow is the honest path. */}
        <SectionLabel label="Mes données" />
        <Card>
          <ActionRow
            Icon={Download}
            label="Télécharger mes données"
            sub="On t'envoie une copie de tes données par email."
            onPress={() =>
              Linking.openURL(
                'mailto:support@linky.gn?subject=' +
                  encodeURIComponent('Demande de téléchargement de mes données Linky'),
              ).catch(() => {})
            }
          />
          <ActionRow
            Icon={Trash2}
            label="Supprimer mon compte"
            sub="Action définitive après 30 jours d'attente."
            danger
            last
            onPress={() =>
              Linking.openURL(
                'mailto:support@linky.gn?subject=' +
                  encodeURIComponent('Demande de suppression de mon compte Linky'),
              ).catch(() => {})
            }
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
  last,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const fg = danger ? colors.danger : colors.text;
  return (
    <Pressable
      // Phase X.7 — onPress was haptic-only ; now driven by the caller so
      // the two GDPR rows can wire to support-email workflows.
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
