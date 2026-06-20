// Phase T.2 — the "Devenir vendeur" / "Devenir agent" upgrade pitch.
//
// Conversion moment. A pure buyer who taps "Vendre" on Home (or any role-gated
// surface) lands here. Three calm benefits framed in tu-form, then ONE primary
// CTA that:
//   1) toggles the role on via update-profile (server) + local store
//   2) routes onward — KYC intro if not approved, else /create
//
// Keep light (3G-friendly): no hero photo, just iconography and three benefits.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ShieldCheck, BadgeCheck, Wallet as WalletIcon, Store, Building2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth, type UserRole } from '../../src/stores/auth';
import { useUpdateProfile } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { useKycStatus } from '../../src/data/queries';

export default function DevenirRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ role?: string }>();
  const targetRole: 'seller' | 'agent' = params.role === 'agent' ? 'agent' : 'seller';

  // Memo over t so a language switch re-renders the screen with translated
  // copy. Keep icons + role keys outside the memo (stable across languages).
  const copy = useMemo(
    () => ({
      title: t(`profilDevenir.${targetRole}.title`),
      subtitle: t(`profilDevenir.${targetRole}.subtitle`),
      primaryCta: t(`profilDevenir.${targetRole}.primaryCta`),
      Icon: targetRole === 'seller' ? Store : Building2,
      benefits: [
        {
          Icon: ShieldCheck,
          title: t(`profilDevenir.${targetRole}.benefit1Title`),
          desc: t(`profilDevenir.${targetRole}.benefit1Desc`),
        },
        {
          Icon: BadgeCheck,
          title: t(`profilDevenir.${targetRole}.benefit2Title`),
          desc: t(`profilDevenir.${targetRole}.benefit2Desc`),
        },
        {
          Icon: WalletIcon,
          title: t(`profilDevenir.${targetRole}.benefit3Title`),
          desc: t(`profilDevenir.${targetRole}.benefit3Desc`),
        },
      ],
    }),
    [t, targetRole],
  );

  const currentRoles = useAuth((s) => s.roles);
  const setRoles = useAuth((s) => s.setRoles);
  const signIn = useAuth((s) => s.signIn);
  const currentUser = useAuth((s) => s.user);
  // T.2.fix — live KYC beats the cached snapshot ; without this a
  // fresh-approved user gets sent through kyc/intro again on the next
  // upgrade pitch because the MMKV-cached user only refreshes at sign-in.
  const { data: kyc } = useKycStatus();
  const cachedKyc = currentUser?.kyc_status ?? null;
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Idempotent: if the role is already on locally, don't waste a server roundtrip.
  const alreadyHas = currentRoles.includes(targetRole as UserRole);

  const nextRoles = useMemo<UserRole[]>(() => {
    const set = new Set<UserRole>(currentRoles);
    set.add(targetRole as UserRole);
    return Array.from(set);
  }, [currentRoles, targetRole]);

  const onActivate = async () => {
    setSubmitting(true);
    try {
      // Live KYC : prefer the freshly-mutated response (update-profile
      // returns the user row including kyc_status), then the live useKycStatus
      // poll, and only fall back to the cached AuthUser snapshot. This avoids
      // the "cached-stale → kyc/intro detour" for users who just got approved.
      let freshKyc: string | null = kyc?.kycStatus ?? cachedKyc;
      if (!alreadyHas) {
        const res = await updateProfile.mutateAsync({ roles: nextRoles });
        setRoles(nextRoles);
        if (currentUser) signIn({ ...currentUser, ...res.user });
        if (res.user.kyc_status !== undefined && res.user.kyc_status !== null) {
          freshKyc = res.user.kyc_status;
        }
      }
      // KYC mandatory for publish ; sellers/agents go through Didit once.
      if (freshKyc !== 'approved') {
        router.replace('/kyc/intro');
      } else {
        router.replace('/create');
      }
    } catch (e) {
      toast.show(toToastMessage(e, t('profilDevenir.activationError')), 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          accessibilityLabel={t('profilDevenir.back')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
            marginTop: 6,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.6 }}>
            {t('profilDevenir.newRoleLabel')}
          </Text>
        </View>
        <Text variant="dispL" style={{ fontSize: 28, lineHeight: 34 }}>
          {copy.title}
        </Text>
        <Text variant="bodyM" tone="muted" style={{ marginTop: 10, lineHeight: 21 }}>
          {copy.subtitle}
        </Text>

        <View style={{ marginTop: 28, gap: 14 }}>
          {copy.benefits.map((b) => (
            <View
              key={b.title}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <b.Icon size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleM" style={{ fontSize: 14 }}>
                  {b.title}
                </Text>
                <Text
                  variant="micro"
                  tone="muted"
                  style={{ letterSpacing: 0, textTransform: 'none', marginTop: 4, lineHeight: 18 }}
                >
                  {b.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {(kyc?.kycStatus ?? cachedKyc) !== 'approved' && (
          <View
            style={{
              marginTop: 22,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <ShieldCheck size={16} color={colors.textMuted} strokeWidth={2} />
            <Text
              variant="micro"
              tone="muted"
              style={{ flex: 1, letterSpacing: 0, textTransform: 'none', lineHeight: 17 }}
            >
              {t('profilDevenir.kycHint')}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingVertical: 16, gap: 8 }}>
        <Button
          variant="dark"
          size="lg"
          block
          label={alreadyHas ? t('profilDevenir.continue') : copy.primaryCta}
          onPress={onActivate}
          loading={submitting}
        />
        <Button
          variant="ghost"
          size="sm"
          block
          label={t('profilDevenir.later')}
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}
