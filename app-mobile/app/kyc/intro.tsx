import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { ArrowLeft, IdCard, Camera, ScanFace, ShieldCheck, Lock, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useStartKyc } from '../../src/data/queries';
import { ApiError } from '../../src/lib/api';

// Phase I.8 — STEPS / ASSURANCES carry labelKey only, resolved at render.
const STEP_DEFS = [
  { n: '01', labelKey: 'kyc.step01Label', Icon: IdCard },
  { n: '02', labelKey: 'kyc.step02Label', Icon: Camera },
  { n: '03', labelKey: 'kyc.step03Label', Icon: ScanFace },
];

const ASSURANCE_DEFS = [
  { Icon: Lock, labelKey: 'kyc.assurance1' },
  { Icon: Clock, labelKey: 'kyc.assurance2' },
  { Icon: ShieldCheck, labelKey: 'kyc.assurance3' },
];

export default function KycIntroRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const startKyc = useStartKyc();
  const [error, setError] = useState<string | null>(null);
  const STEPS = useMemo(
    () => STEP_DEFS.map((s) => ({ ...s, label: t(s.labelKey) })),
    [t],
  );
  const ASSURANCES = useMemo(
    () => ASSURANCE_DEFS.map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );

  // Phase P — the capture happens in Didit's hosted flow (ID scan + selfie +
  // liveness in the in-app browser). The browser closes itself when Didit
  // redirects to linky://kyc/return ; we then land on the pending screen,
  // which polls the decision.
  const onStart = async () => {
    setError(null);
    try {
      const r = await startKyc.mutateAsync();
      if (r.kycStatus === 'approved') {
        router.replace('/(tabs)/profil');
        return;
      }
      if (r.kycStatus === 'in_review') {
        // A human reviewer already has the file — nothing to capture.
        router.replace('/kyc/pending');
        return;
      }
      if (r.url) {
        const result = await WebBrowser.openAuthSessionAsync(r.url, Linking.createURL('kyc/return'));
        // 'success' = Didit redirected to linky://kyc/return → submitted.
        // 'dismiss'/'cancel' = user closed the browser early : stay here so
        // the pending screen never claims « C'est envoyé ! » for an empty
        // session. (If the deep link DID fire, return.tsx already navigated
        // to pending and this replace is a no-op on an unfocused screen.)
        if (result.type !== 'success') return;
      }
      router.replace('/kyc/pending');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'KYC_NOT_CONFIGURED') {
        setError(t('kyc.errorComingSoon'));
      } else if (e instanceof ApiError && e.code === 'KYC_PROVIDER_ERROR') {
        setError(e.message_fr); // « service indisponible » — pas la faute de sa connexion
      } else {
        setError(t('kyc.errorCannotStart'));
      }
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 8, paddingBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.primarySoft,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.4 }}>
              {t('kyc.badge')}
            </Text>
          </View>

          <Text variant="dispL" style={{ fontSize: 32, lineHeight: 38 }}>
            {t('kyc.title')}
          </Text>
          <Text
            variant="bodyM"
            tone="muted"
            style={{ marginTop: 10, fontSize: 15, lineHeight: 22, letterSpacing: 0 }}
          >
            {t('kyc.subtitle')}
          </Text>

          {/* Steps */}
          <View style={{ marginTop: 32, gap: 14 }}>
            {STEPS.map((s, idx) => {
              const Icon = s.Icon;
              return (
                <View
                  key={s.n}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 6,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} color={colors.text} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6 }}>
                      {s.n}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 1 }}>
                      {s.label}
                    </Text>
                  </View>
                  {idx < STEPS.length - 1 && (
                    <View style={{ width: 1, height: 0 }} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Trust strip */}
          <View
            style={{
              marginTop: 32,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              gap: 8,
            }}
          >
            {ASSURANCES.map(({ Icon, label }) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon size={14} color={colors.primary} strokeWidth={2} />
                <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 4, paddingBottom: 4 }}>
          {error && (
            <Text center style={{ fontSize: 12.5, color: colors.danger, marginBottom: 8, letterSpacing: 0 }}>
              {error}
            </Text>
          )}
          <Button
            variant="dark"
            size="lg"
            block
            label={startKyc.isPending ? t('kyc.ctaStarting') : t('kyc.ctaStart')}
            loading={startKyc.isPending}
            onPress={onStart}
          />
          <Button
            variant="ghost"
            size="sm"
            block
            label={t('kyc.ctaLater')}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
