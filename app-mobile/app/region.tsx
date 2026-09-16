import { useCallback, useMemo, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, CreditCard, Phone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Button } from '../src/components/primitives/Button';
import { useAuth } from '../src/stores/auth';
import { haptic } from '../src/lib/haptics';
import { fetchMe, useUpdateProfile } from '../src/data/queries/auth';
import { ApiError, toToastMessage } from '../src/lib/api';
import { useToast } from '../src/components/feedback/Toast';
import type { PaymentProfile } from '../src/lib/paymentProfile';

/**
 * « Vous etes ou ? » — pour les comptes crees AVANT que l'inscription enregistre
 * la region de paiement.
 *
 * DEMANDE DU CLIENT, 2026-09-17 : « Il faut que je refasse l'inscription des
 * comptes deja existants ». Non : ils recoivent la meme question que les
 * nouveaux inscrits, une seule fois, et la reponse passe par le meme verrou
 * serveur (update-profile n'ecrit payment_profile que tant qu'il est vide).
 *
 * N'APPARAIT QUE SI LE SERVEUR LE CONFIRME : src/lib/profileSync.ts ne pousse
 * cet ecran qu'apres get-me, jamais sur la foi d'un cache.
 *
 * AUCUN CHOIX PAR DEFAUT, CONTRAIREMENT A L'INSCRIPTION. La reponse est
 * definitive. Pre-cocher la region deduite de l'indicatif reviendrait a faire
 * valider d'un doigt distrait exactement l'erreur que cet ecran corrige : un
 * compte +224 tenu depuis l'etranger. Le bouton reste donc inactif tant qu'on
 * n'a pas choisi.
 *
 * ON NE PEUT PAS S'EN ALLER SANS REPONDRE : pas de retour, ni geste, ni bouton
 * Android. L'ecran n'apparait qu'une fois, et c'est lui qui decide du moyen de
 * paiement carte du compte.
 */
interface Option {
  id: PaymentProfile;
  title: string;
  sub: string;
  Icon: LucideIcon;
}

export default function RegionRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const updateProfile = useUpdateProfile();
  const [choice, setChoice] = useState<PaymentProfile | null>(null);

  const OPTIONS: Option[] = useMemo(
    () => [
      { id: 'guinea', title: t('onboarding.authChoice.phoneTitle'), sub: 'Carte bancaire via LengoPay et Mobile Money', Icon: Phone },
      { id: 'abroad', title: t('onboarding.authChoice.emailTitle'), sub: 'Carte bancaire via Stripe', Icon: CreditCard },
    ],
    [t],
  );

  // Le bouton retour d'Android ne doit pas permettre d'esquiver la question.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const mergeUser = (user: Partial<ReturnType<typeof useAuth.getState>['user']>) => {
    const state = useAuth.getState();
    if (state.user) state.signIn({ ...state.user, ...user });
  };

  const onConfirm = async () => {
    if (!choice || updateProfile.isPending) return;
    haptic.medium();
    try {
      const res = await updateProfile.mutateAsync({ payment_profile: choice });
      mergeUser(res.user);
      haptic.success();
      leave();
    } catch (e) {
      // Une region existe deja cote serveur (corrigee par l'equipe entre-temps) :
      // ce n'est pas une erreur pour l'utilisateur. On recharge la vraie valeur
      // et on le laisse continuer.
      if (e instanceof ApiError && e.code === 'PAYMENT_PROFILE_LOCKED') {
        try {
          const { user } = await fetchMe();
          mergeUser(user);
        } catch {
          // La valeur arrivera a la prochaine ouverture.
        }
        toast.show('Ta région de paiement était déjà définie.', 'info');
        leave();
        return;
      }
      haptic.error();
      toast.show(toToastMessage(e, 'Impossible d’enregistrer ta région. Réessaie.'), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ marginTop: 56 }}>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: colors.text }}>
            {t('onboarding.authChoice.title')}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
            {t('onboarding.authChoice.subtitle')}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textFaint }}>
            Ce choix est définitif. Si tu changes de pays, contacte l’équipe Linky.
          </Text>
        </View>

        <View style={{ marginTop: 36, gap: 12 }}>
          {OPTIONS.map((opt) => {
            const selected = choice === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  haptic.selection();
                  setChoice(opt.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 22,
                  paddingHorizontal: 20,
                  borderRadius: radii.lg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.text : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <opt.Icon size={22} color={selected ? colors.bg : colors.text} strokeWidth={2.25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{opt.title}</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: colors.textMuted }}>{opt.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 'auto', paddingBottom: 8 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={t('common.continue')}
            trailing={<ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />}
            loading={updateProfile.isPending}
            disabled={!choice || updateProfile.isPending}
            onPress={() => void onConfirm()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
