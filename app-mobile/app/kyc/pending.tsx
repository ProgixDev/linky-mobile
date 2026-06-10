// Phase P.4 — live KYC decision screen. Polls kyc-status every 2.5s while the
// Didit session is open ; flips to the verified / declined state in place the
// moment the webhook (or the poll safety-net) lands the decision.
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Clock, Bell, X, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { haptic } from '../../src/lib/haptics';
import { useKycStatus } from '../../src/data/queries';

const SUBMITTED = ["Pièce d'identité", 'Selfie de contrôle'];

export default function KycPendingRoute() {
  const { colors } = useTheme();
  const { data } = useKycStatus({ poll: true });
  const status = data?.kycStatus ?? 'pending';

  const isApproved = status === 'approved';
  const isDeclined = status === 'declined';
  // 'none' after landing here = the Didit session expired / was abandoned —
  // the mirror was reset for retry. Frozen "C'est envoyé !" would be a lie.
  const isExpired = status === 'none';
  const isOpen = !isApproved && !isDeclined && !isExpired;

  // Check icon entrance — scale + opacity
  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (isDeclined) haptic.error();
    else if (isApproved) haptic.success();
    else haptic.light();
    checkScale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1, { damping: 9, stiffness: 140, mass: 0.7 }),
    );
    ringScale.value = withDelay(120, withTiming(1.6, { duration: 700, easing: Easing.out(Easing.quad) }));
    ringOpacity.value = withSequence(
      withDelay(120, withTiming(1, { duration: 60 })),
      withTiming(0, { duration: 640, easing: Easing.out(Easing.quad) }),
    );
    // Re-fires on decision flip so the badge pops again with the new color.
  }, [checkScale, ringOpacity, ringScale, status, isApproved, isDeclined]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const badgeColor = isDeclined || isExpired ? colors.danger : colors.primary;
  const BadgeIcon = isApproved ? ShieldCheck : isDeclined || isExpired ? X : Check;

  const title = isApproved
    ? 'Identité vérifiée !'
    : isDeclined
      ? 'Vérification non aboutie'
      : isExpired
        ? 'Session expirée'
        : "C'est envoyé !";
  const subtitle = isApproved
    ? 'Ton compte est vérifié — ta boutique porte maintenant le badge « Vendeur vérifié ».'
    : isDeclined
      ? "La vérification n'a pas abouti. Assure-toi que ta pièce est lisible, bien éclairée, et réessaie."
      : isExpired
        ? "La vérification n'a pas été terminée. Tu peux recommencer quand tu veux."
        : 'On vérifie tes documents et on te tient au courant. En attendant, tu peux continuer à utiliser Linky normalement.';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 16 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* Animated badge with expanding ring */}
          <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 120,
                  height: 120,
                  borderRadius: 999,
                  backgroundColor: badgeColor,
                },
                ringStyle,
              ]}
            />
            <Animated.View
              style={[
                {
                  width: 92,
                  height: 92,
                  borderRadius: 999,
                  backgroundColor: badgeColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: badgeColor,
                  shadowOpacity: 0.35,
                  shadowRadius: 22,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 10,
                },
                checkStyle,
              ]}
            >
              <BadgeIcon size={42} color="#FFFFFF" strokeWidth={isApproved ? 2.25 : 3} />
            </Animated.View>
          </View>

          <Text variant="dispL" center style={{ fontSize: 26, marginTop: 26 }}>
            {title}
          </Text>
          <Text
            variant="bodyM"
            tone="muted"
            center
            style={{ marginTop: 10, fontSize: 14.5, lineHeight: 21, maxWidth: 300, letterSpacing: 0 }}
          >
            {subtitle}
          </Text>

          {/* ETA chip — only while a decision is open */}
          {isOpen && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: colors.primarySoft,
                marginTop: 18,
              }}
            >
              <Clock size={13} color={colors.primaryDeep} strokeWidth={2.25} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.primaryDeep, letterSpacing: 0.1 }}>
                {status === 'in_review' ? 'Examen manuel en cours' : 'Réponse sous 48 h'}
              </Text>
            </View>
          )}

          {/* Submitted docs */}
          {isOpen && (
            <View
              style={{
                marginTop: 28,
                width: '100%',
                padding: 16,
                borderRadius: 16,
                backgroundColor: colors.bgSunken,
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6 }}>
                ENVOYÉ
              </Text>
              {SUBMITTED.map((t) => (
                <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={11} color="#FFFFFF" strokeWidth={3.5} />
                  </View>
                  <Text style={{ fontSize: 13.5, color: colors.text }}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ gap: 6 }}>
          {isOpen && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
              <Bell size={12} color={colors.textMuted} strokeWidth={2} />
              <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0 }}>
                On t'envoie une notification dès que c'est validé.
              </Text>
            </View>
          )}
          {isDeclined || isExpired ? (
            <>
              <Button variant="dark" size="lg" block label="Réessayer" onPress={() => router.replace('/kyc/intro')} />
              <Button variant="ghost" size="sm" block label="Retour au profil" onPress={() => router.replace('/(tabs)/profil')} />
            </>
          ) : (
            <>
              <Button variant="dark" size="lg" block label="Continuer sur Linky" onPress={() => router.replace('/(tabs)')} />
              <Button variant="ghost" size="sm" block label="Retour au profil" onPress={() => router.replace('/(tabs)/profil')} />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
