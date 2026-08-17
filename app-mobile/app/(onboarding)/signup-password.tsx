import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Eye, EyeOff, Lock } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { useRequestOtp } from '../../src/data/queries/auth';
import { toToastMessage } from '../../src/lib/api';
import { useToast } from '../../src/components/feedback/Toast';
import { haptic } from '../../src/lib/haptics';

// Inscription « mot de passe d'abord » (client 2026-08-17), le standard des
// applications internationales : on choisit son mot de passe A L'INSCRIPTION,
// et le code recu ne sert qu'a prouver une fois qu'on est bien proprietaire de
// l'adresse. Ensuite on se connecte au mot de passe — plus un SMS a chaque fois.
//
// ORDRE VOLONTAIRE : le mot de passe est saisi ICI, mais le compte n'est cree
// qu'a la validation du code. Aucun compte non verifie portant un mot de passe
// n'existe donc jamais, ce qui ferme le detournement par pre-inscription
// (quelqu'un qui enregistrerait l'adresse d'un tiers pour en garder la cle).
// Le mot de passe transite par le magasin d'authentification, en memoire seule,
// jamais sur le disque.
export default function SignupPasswordRoute() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ channel?: string; target?: string }>();
  const channel = params.channel === 'phone' ? 'phone' : 'email';
  const target = params.target ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [focus, setFocus] = useState<'pwd' | 'confirm' | null>(null);

  const setPendingPassword = useAuth((s) => s.setPendingPassword);
  const setPendingOtpId = useAuth((s) => s.setPendingOtpId);
  const setPendingDevCode = useAuth((s) => s.setPendingDevCode);
  const setPendingDelivery = useAuth((s) => s.setPendingDelivery);
  const requestOtp = useRequestOtp();
  const toast = useToast();

  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;
  const valid = longEnough && matches;
  const busy = requestOtp.isPending;

  const onContinue = async () => {
    if (!valid || busy) return;
    try {
      haptic.medium();
      // Le mot de passe est garde en memoire, PUIS le code part. Si l'envoi
      // echoue, rien n'a ete cree nulle part : l'utilisateur peut recommencer.
      setPendingPassword(password);
      const { otp_id, dev_code, delivery } = await requestOtp.mutateAsync({ channel, target });
      setPendingOtpId(otp_id);
      setPendingDevCode(dev_code ?? null);
      setPendingDelivery(delivery ?? null);
      router.push('/(onboarding)/otp');
    } catch (e) {
      setPendingPassword(null);
      toast.show(toToastMessage(e, "Impossible d'envoyer le code. Réessaie."), 'danger');
    }
  };

  const fieldStyle = (active: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    borderWidth: active ? 2 : 1,
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
  });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{ marginTop: 8, width: 40, height: 40, justifyContent: 'center' }}
          >
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>

          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
              Choisis ton mot de passe
            </Text>
            <Text variant="bodyM" tone="muted" style={{ letterSpacing: 0 }}>
              Il te servira à te reconnecter sans attendre de code. On t'enverra un
              code une seule fois, pour vérifier que {target} t'appartient.
            </Text>
          </View>

          <View style={{ marginTop: 24, gap: 12 }}>
            <View style={fieldStyle(focus === 'pwd')}>
              <Lock size={18} color={focus === 'pwd' ? colors.primary : colors.textMuted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('pwd')}
                onBlur={() => setFocus(null)}
                placeholder="Mot de passe"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!reveal}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={{ flex: 1, fontSize: 16, color: colors.text }}
              />
              <Pressable onPress={() => setReveal((v) => !v)} hitSlop={10}>
                {reveal ? (
                  <EyeOff size={18} color={colors.textMuted} />
                ) : (
                  <Eye size={18} color={colors.textMuted} />
                )}
              </Pressable>
            </View>

            <View style={fieldStyle(focus === 'confirm')}>
              <Lock size={18} color={focus === 'confirm' ? colors.primary : colors.textMuted} />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setFocus('confirm')}
                onBlur={() => setFocus(null)}
                placeholder="Confirme le mot de passe"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!reveal}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={{ flex: 1, fontSize: 16, color: colors.text }}
              />
            </View>

            {/* Les exigences sont affichees en permanence et se cochent en direct,
                plutot que de surgir en rouge apres coup. On ne dit jamais « non »
                sans avoir dit « voila ce qu'il faut ». */}
            <View style={{ gap: 6, marginTop: 2 }}>
              <Rule ok={longEnough} label="Au moins 8 caractères" />
              <Rule ok={matches} label="Les deux saisies sont identiques" />
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ paddingBottom: 4 }}>
            <Button
              variant="dark"
              size="lg"
              block
              label="Continuer"
              disabled={!valid || busy}
              loading={busy}
              onPress={() => void onContinue()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ok ? colors.primary : 'transparent',
          borderWidth: ok ? 0 : 1.5,
          borderColor: colors.border,
        }}
      >
        {ok ? <Check size={10} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <Text variant="caption" style={{ color: ok ? colors.text : colors.textMuted, letterSpacing: 0 }}>
        {label}
      </Text>
    </View>
  );
}
