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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';

const APP_VERSION = '0.1.0';
const APP_BUILD = '1';

export default function AboutRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ScreenHeader title={t('aboutScreen.topbar')} />

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
            {t('aboutScreen.version', { version: APP_VERSION, build: APP_BUILD })}
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
            {t('aboutScreen.tagline')}
          </Text>
        </View>

        {/* Phase X.7 — "Noter sur l'App Store" removed (no V1 store
            presence: Android APK side-loaded, iOS not built). Partager
            Linky now uses the native Share API instead of a haptic-only
            no-op. */}
        <SectionLabel label={t('aboutScreen.sectionHelp')} />
        <Card>
          <ActionRow
            Icon={Share2}
            label={t('aboutScreen.shareLabel')}
            sub={t('aboutScreen.shareSub')}
            onPress={() => {
              haptic.light();
              void Share.share({
                title: 'Linky',
                message: t('aboutScreen.shareMessage'),
              }).catch(() => {});
            }}
            last
          />
        </Card>

        <SectionLabel label={t('aboutScreen.sectionContact')} />
        <Card>
          <ActionRow
            Icon={AtSign}
            label={t('aboutScreen.instagramLabel')}
            sub={t('aboutScreen.instagramSub')}
            onPress={() => Linking.openURL('https://instagram.com/linkyapp').catch(() => {})}
            trailing={<ExternalLink size={14} color={colors.textFaint} strokeWidth={2} />}
          />
          <ActionRow
            Icon={Globe}
            label={t('aboutScreen.websiteLabel')}
            sub={t('aboutScreen.websiteSub')}
            onPress={() => Linking.openURL('https://linkygroup.com').catch(() => {})}
            trailing={<ExternalLink size={14} color={colors.textFaint} strokeWidth={2} />}
          />
          <ActionRow
            Icon={Mail}
            label={t('aboutScreen.writeLabel')}
            sub={t('aboutScreen.writeSub')}
            onPress={() => Linking.openURL('mailto:hello@linkygroup.com').catch(() => {})}
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
            {t('aboutScreen.madeWith')}
          </Text>
          <Heart size={11} color={colors.danger} fill={colors.danger} strokeWidth={0} />
          <Text style={{ fontSize: 12, color: colors.textFaint, letterSpacing: 0 }}>
            {t('aboutScreen.atConakry')}
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
