import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { useRequestOtp, useVerifyOtp } from '../../src/data/queries/auth';
import { toToastMessage } from '../../src/lib/api';
import { useToast } from '../../src/components/feedback/Toast';
import { maskEmail, maskPhone } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';

const CODE_LENGTH = 6;

function OtpCells({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<TextInput>(null);
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      accessibilityLabel="Code à 6 chiffres"
    >
      {Array.from({ length: CODE_LENGTH }).map((_, i) => {
        const ch = value[i] ?? '';
        const filled = !!ch;
        const isCursor = value.length === i;
        return (
          <View
            key={i}
            style={{
              width: 48,
              height: 56,
              borderRadius: 14,
              borderWidth: filled || isCursor ? 2 : 1,
              borderColor: filled ? colors.primary : isCursor ? colors.text : colors.border,
              backgroundColor: filled ? colors.primarySoft : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {filled ? (
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  textAlign: 'center',
                  lineHeight: 26,
                  includeFontPadding: false,
                }}
              >
                {ch}
              </Text>
            ) : isCursor ? (
              <View
                style={{
                  width: 2,
                  height: 22,
                  borderRadius: 1,
                  backgroundColor: colors.text,
                }}
              />
            ) : (
              <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: colors.border }} />
            )}
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        autoFocus
        maxLength={CODE_LENGTH}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
      />
    </Pressable>
  );
}

export default function OtpRoute() {
  const { colors } = useTheme();
  const channel = useAuth((s) => s.channel);
  const phone = useAuth((s) => s.pendingPhone);
  const email = useAuth((s) => s.pendingEmail);
  const pendingOtpId = useAuth((s) => s.pendingOtpId);
  const setPendingOtpId = useAuth((s) => s.setPendingOtpId);
  const pendingDevCode = useAuth((s) => s.pendingDevCode);
  const setPendingDevCode = useAuth((s) => s.setPendingDevCode);
  const setTokens = useAuth((s) => s.setTokens);
  const signIn = useAuth((s) => s.signIn);
  const verifyOtp = useVerifyOtp();
  const requestOtp = useRequestOtp();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(20);
  const firedRef = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  // DEV-ONLY auto-fill: in stub mode otp-request echoes the code; drop it into the
  // input so the existing 6-digit auto-verify effect fires. Cleared after consuming.
  useEffect(() => {
    if (pendingDevCode) {
      setCode(pendingDevCode);
      setPendingDevCode(null);
    }
  }, [pendingDevCode, setPendingDevCode]);

  const verify = () => {
    if (code.length !== CODE_LENGTH || verifyOtp.isPending || firedRef.current) return;
    if (!pendingOtpId) {
      toast.show('Session OTP introuvable — recommence', 'danger');
      router.replace(channel === 'email' ? '/(onboarding)/email' : '/(onboarding)/phone');
      return;
    }
    firedRef.current = true;
    (async () => {
      try {
        const { access_token, refresh_token, user } = await verifyOtp.mutateAsync({
          otp_id: pendingOtpId,
          code,
        });
        await setTokens(access_token, refresh_token);
        setPendingOtpId(null);
        signIn(user);
        haptic.success();
        router.push('/(onboarding)/profile-setup');
      } catch (e: unknown) {
        console.error('[otp-verify] error:', e);
        toast.show(toToastMessage(e, 'Code invalide'), 'danger');
        setCode('');
        firedRef.current = false; // allow retry after error
        haptic.warning();
      }
    })();
  };

  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, pendingOtpId]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 8, paddingBottom: 24 }}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace(channel === 'email' ? '/(onboarding)/email' : '/(onboarding)/phone');
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
              VÉRIFICATION
            </Text>
          </View>

          <Text variant="dispL" style={{ fontSize: 32, lineHeight: 38 }}>
            Entre le code.
          </Text>
          <Text
            variant="bodyM"
            tone="muted"
            style={{ marginTop: 10, fontSize: 15, lineHeight: 22, letterSpacing: 0 }}
          >
            {channel === 'email' ? 'Envoyé à' : 'Envoyé au'}{' '}
            <Text
              style={{
                color: colors.text,
                fontWeight: '600',
                fontVariant: channel === 'email' ? undefined : ['tabular-nums'],
                letterSpacing: 0.3,
              }}
            >
              {channel === 'email' ? maskEmail(email) : maskPhone(phone)}
            </Text>
            .
          </Text>

          <View style={{ marginTop: 32 }}>
            <OtpCells value={code} onChange={setCode} />
          </View>

          {/* Resend row */}
          <View style={{ marginTop: 26, alignItems: 'center' }}>
            {seconds > 0 ? (
              <Text style={{ fontSize: 13, color: colors.textMuted, letterSpacing: 0 }}>
                Renvoyer dans{' '}
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {mm}:{ss}
                </Text>
              </Text>
            ) : (
              <Pressable
                onPress={async () => {
                  if (requestOtp.isPending) return;
                  // Re-request OTP for the same target. Server-side: 1/min/target limit applies.
                  const target = channel === 'email' ? email.trim() : phone.replace(/\s+/g, '');
                  try {
                    const { otp_id, dev_code } = await requestOtp.mutateAsync({ channel, target });
                    setPendingOtpId(otp_id);
                    setPendingDevCode(dev_code ?? null);
                    setSeconds(20);
                    haptic.light();
                  } catch (e: unknown) {
                    console.error('[otp-resend] error:', e);
                    toast.show(toToastMessage(e, 'Renvoi impossible'), 'danger');
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <RefreshCw size={13} color={colors.text} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                  {requestOtp.isPending ? 'Envoi…' : 'Renvoyer le code'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ paddingBottom: 4 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={verifyOtp.isPending ? 'Vérification…' : 'Vérifier'}
            disabled={code.length !== CODE_LENGTH || verifyOtp.isPending}
            onPress={verify}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
