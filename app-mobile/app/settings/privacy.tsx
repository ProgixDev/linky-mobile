import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Eye,
  Sparkles,
  BarChart3,
  Download,
  Trash2,
  Lock,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Switch } from '../../src/components/primitives/Switch';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';
import { usePrefs } from '../../src/stores/prefs';
import { useAuth } from '../../src/stores/auth';
import { apiPost, toToastMessage } from '../../src/lib/api';
import { unregisterPushToken } from '../../src/lib/push';
import { useToast } from '../../src/components/feedback/Toast';

export default function PrivacyRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
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

  // Self-serve deletion (was a mailto stub) — calls the delete-account edge
  // fn. The server refuses (409, explicit French message) while money is in
  // motion: non-empty wallet, open orders/bookings, pending withdrawal.
  const signOut = useAuth((s) => s.signOut);
  const [deleting, setDeleting] = useState(false);
  const onDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      t('settings.privacy.deleteConfirmTitle'),
      t('settings.privacy.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.privacy.deleteContinue'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await apiPost<{ deleted: boolean }>({ path: '/delete-account', body: {} });
                // Push token first (authed call), then tear the session down.
                await unregisterPushToken().catch(() => undefined);
                await signOut();
                router.replace('/(onboarding)' as never);
              } catch (e) {
                toast.show(toToastMessage(e, t('settings.privacy.deleteMailError')), 'danger');
              } finally {
                setDeleting(false);
              }
            })();
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
          title={t('settings.privacy.title')}
          subtitle={t('settings.privacy.subtitle')}
        />

        <SectionLabel label={t('settings.privacy.sectionData')} />
        <Card>
          {/* Pre-prod: every privacy toggle persists to MMKV but the downstream
              gates (recommender, analytics, ad-tracking, profile visibility)
              don't ship until V1.1. Badge each row so the user sees the
              preference is stored for when the feature lands, not silently
              ignored today. */}
          <ToggleRow
            Icon={Sparkles}
            label={t('settings.privacy.togglePersonalize')}
            sub={t('settings.privacy.togglePersonalizeSub')}
            value={personalize}
            onChange={setPersonalize}
            comingSoon
          />
          <ToggleRow
            Icon={BarChart3}
            label={t('settings.privacy.toggleAnalytics')}
            sub={t('settings.privacy.toggleAnalyticsSub')}
            value={analytics}
            onChange={setAnalytics}
            comingSoon
          />
          <ToggleRow
            Icon={Eye}
            label={t('settings.privacy.toggleAds')}
            sub={t('settings.privacy.toggleAdsSub')}
            value={adTracking}
            onChange={setAdTracking}
            comingSoon
            last
          />
        </Card>

        <SectionLabel label={t('settings.privacy.sectionProfile')} />
        <Card>
          <ToggleRow
            Icon={Lock}
            label={t('settings.privacy.toggleProfilePublic')}
            sub={t('settings.privacy.toggleProfilePublicSub')}
            value={profilePublic}
            onChange={setProfilePublic}
            comingSoon
            last
          />
        </Card>

        {/* Phase Y.3 — "Télécharger mes données" has no V1 self-serve backend ;
            it's now an honest "Bientôt" row (no mailto, no fake "we sent you
            an email"). "Supprimer mon compte" stays actionable via support
            mail with an explicit confirm dialog — GDPR requires a path. */}
        <SectionLabel label={t('settings.privacy.sectionMyData')} />
        <Card>
          <ActionRow
            Icon={Download}
            label={t('settings.privacy.downloadLabel')}
            sub={t('settings.privacy.downloadSub')}
            comingSoon
            onPress={() => toast.show(t('common.comingSoonAvailable'), 'info')}
          />
          <ActionRow
            Icon={Trash2}
            label={t('settings.privacy.deleteLabel')}
            sub={t('settings.privacy.deleteSub')}
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
  comingSoon,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  comingSoon?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                {t('settings.privacy.bientotBadge')}
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
  const { t } = useTranslation();
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
                {t('settings.privacy.bientotBadge')}
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
