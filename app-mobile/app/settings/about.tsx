import { Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Share2,
  AtSign,
  Globe,
  Mail,
  ExternalLink,
  Heart,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';

const APP_VERSION = '0.1.0';
const APP_BUILD = '1';

export default function AboutRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ScreenHeader title="À propos de Linky" />

        {/* Logo + version */}
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: colors.primary,
              shadowOpacity: 0.35,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 8,
              overflow: 'hidden',
            }}
          >
            <Image
              source={require('../../assets/images/adaptive-icon-dark.png')}
              style={{ width: 72, height: 72 }}
              contentFit="contain"
            />
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: colors.text,
              marginTop: 16,
              letterSpacing: -0.3,
            }}
          >
            Linky
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: colors.textMuted,
              marginTop: 4,
              fontVariant: ['tabular-nums'],
              letterSpacing: 0,
            }}
          >
            Version {APP_VERSION} · Build {APP_BUILD}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.textMuted,
              marginTop: 12,
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 18,
              letterSpacing: 0,
            }}
          >
            Le marché et l'immobilier en Guinée, dans une seule app. Fait avec soin à Conakry.
          </Text>
        </View>

        {/* Phase X.7 — "Noter sur l'App Store" removed (no V1 store
            presence: Android APK side-loaded, iOS not built). Partager
            Linky now uses the native Share API instead of a haptic-only
            no-op. */}
        <SectionLabel label="Aide la communauté" />
        <Card>
          <ActionRow
            Icon={Share2}
            label="Partager Linky"
            sub="Invite tes amis et proches."
            onPress={() => {
              haptic.light();
              void Share.share({
                title: 'Linky',
                message: "Linky — le marché et l'immobilier en Guinée. À découvrir.",
              }).catch(() => {});
            }}
            last
          />
        </Card>

        <SectionLabel label="Restons en contact" />
        <Card>
          <ActionRow
            Icon={AtSign}
            label="Instagram"
            sub="@linkyapp"
            onPress={() => Linking.openURL('https://instagram.com/linkyapp').catch(() => {})}
            trailing={<ExternalLink size={14} color={colors.textFaint} strokeWidth={2} />}
          />
          <ActionRow
            Icon={Globe}
            label="Site web"
            sub="linky.gn"
            onPress={() => Linking.openURL('https://linky.gn').catch(() => {})}
            trailing={<ExternalLink size={14} color={colors.textFaint} strokeWidth={2} />}
          />
          <ActionRow
            Icon={Mail}
            label="Nous écrire"
            sub="hello@linky.gn"
            onPress={() => Linking.openURL('mailto:hello@linky.gn').catch(() => {})}
            trailing={<ExternalLink size={14} color={colors.textFaint} strokeWidth={2} />}
            last
          />
        </Card>

        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 12,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.textFaint, letterSpacing: 0 }}>
            Fait avec
          </Text>
          <Heart size={11} color={colors.danger} fill={colors.danger} strokeWidth={0} />
          <Text style={{ fontSize: 12, color: colors.textFaint, letterSpacing: 0 }}>
            à Conakry.
          </Text>
        </View>
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

function ActionRow({
  Icon,
  label,
  sub,
  onPress,
  trailing,
  last,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  onPress: () => void;
  trailing?: React.ReactNode;
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
      {trailing}
    </Pressable>
  );
}
