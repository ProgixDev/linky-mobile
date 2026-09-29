// Phase T.2 — "Mes rôles" toggle screen. The promised-but-missing one that
// onboarding's profile-setup escape ("Va dans Profil → Rôles") used to point
// to. Three role toggles ; at least one must remain ON ; enabling seller or
// agent while unverified shows a KYC nudge inline.
// Client 2026-07-06 : enabling a role first opens an instruction sheet (what
// the role allows + the rules to respect) with an explicit confirm button —
// the switch only flips after the user confirms.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, ChevronLeft, ShoppingBag, Store, Building2, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Switch } from '../../src/components/primitives/Switch';
import { useAuth, type UserRole } from '../../src/stores/auth';
import { useUpdateProfile } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { useKycStatus } from '../../src/data/queries';

// Les libelles sont des CLES : ces tables vivent au niveau du module, ou un
// crochet React ne s'appelle pas. Elles sont resolues au rendu par t().
const ROW_DEFS: { role: UserRole; labelKey: string; descKey: string; Icon: typeof Store }[] = [
  { role: 'buyer', labelKey: 'profil.roleBuyer', descKey: 'profil.roleBuyerDesc', Icon: ShoppingBag },
  { role: 'seller', labelKey: 'profil.roleSeller', descKey: 'profil.roleSellerDesc', Icon: Store },
  { role: 'agent', labelKey: 'profil.roleAgent', descKey: 'profil.roleAgentDesc', Icon: Building2 },
];

const ROLE_GUIDE: Record<UserRole, { titleKey: string; can: string[]; must: string[] }> = {
  buyer: {
    titleKey: 'profil.becomeBuyer',
    can: ['profil.buyerCan1', 'profil.buyerCan2', 'profil.buyerCan3'],
    must: ['profil.buyerMust1', 'profil.buyerMust2', 'profil.buyerMust3'],
  },
  seller: {
    titleKey: 'profil.becomeSeller',
    can: ['profil.sellerCan1', 'profil.sellerCan2', 'profil.sellerCan3'],
    must: ['profil.sellerMust1', 'profil.sellerMust2', 'profil.sellerMust3', 'profil.sellerMust4'],
  },
  livreur: {
    titleKey: 'profil.becomeCourier',
    can: ['profil.courierCan1', 'profil.courierCan2'],
    must: ['profil.courierMust1', 'profil.courierMust2'],
  },
  agent: {
    titleKey: 'profil.becomeAgent',
    can: ['profil.agentCan1', 'profil.agentCan2', 'profil.agentCan3'],
    must: ['profil.agentMust1', 'profil.agentMust2', 'profil.agentMust3'],
  },
};

export default function RolesRoute() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const roles = useAuth((s) => s.roles);
  const setRoles = useAuth((s) => s.setRoles);
  const signIn = useAuth((s) => s.signIn);
  const currentUser = useAuth((s) => s.user);
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const { data: kyc } = useKycStatus();
  const kycApproved = (kyc?.kycStatus ?? currentUser?.kyc_status) === 'approved';

  const [selected, setSelected] = useState<Set<UserRole>>(new Set(roles));
  const [submitting, setSubmitting] = useState(false);
  // Role awaiting confirmation in the instruction sheet. Enabling goes
  // through the sheet ; disabling stays direct.
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);

  const toggle = (r: UserRole) => {
    if (!selected.has(r)) {
      setPendingRole(r);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      // Refuse to remove the last role — would violate the non-empty CHECK
      // server-side anyway, but better to block at the UI than to surface a
      // 400 from update-profile.
      if (next.size === 1) return prev;
      next.delete(r);
      return next;
    });
  };

  const confirmPending = () => {
    if (!pendingRole) return;
    setSelected((prev) => new Set(prev).add(pendingRole));
    setPendingRole(null);
  };

  const dirty =
    selected.size !== roles.length ||
    [...selected].some((r) => !roles.includes(r));
  const needsKycNudge =
    !kycApproved && (selected.has('seller') || selected.has('agent'));

  const onSave = async () => {
    if (!dirty || selected.size === 0) return;
    const arr = Array.from(selected).sort();
    setSubmitting(true);
    try {
      const res = await updateProfile.mutateAsync({ roles: arr });
      setRoles(arr);
      if (currentUser) signIn({ ...currentUser, ...res.user });
      toast.show(t('profil.rolesUpdatedToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profil');
    } catch (e) {
      toast.show(toToastMessage(e, 'Impossible de mettre à jour les rôles.'), 'danger');
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
          accessibilityLabel={t('common.back')}
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
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 }}>
          {t('profil.myRoles')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text variant="bodyM" tone="muted" style={{ lineHeight: 21, marginBottom: 18 }}>
          {t('profil.rolesIntro')}
        </Text>

        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {ROW_DEFS.map((row, i) => (
            <Pressable
              key={row.role}
              onPress={() => toggle(row.role)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 14,
                paddingVertical: 16,
                borderBottomWidth: i < ROW_DEFS.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <row.Icon size={17} color={colors.text} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleM" style={{ fontSize: 14.5 }}>
                  {t(row.labelKey)}
                </Text>
                <Text
                  variant="micro"
                  tone="muted"
                  style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}
                >
                  {t(row.descKey)}
                </Text>
              </View>
              <Switch value={selected.has(row.role)} onChange={() => toggle(row.role)} />
            </Pressable>
          ))}
        </View>

        {needsKycNudge && (
          <View
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <ShieldCheck size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text variant="titleM" style={{ fontSize: 13.5 }}>
                {t('profil.kycRequiredTitle')}
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{ letterSpacing: 0, textTransform: 'none', marginTop: 4, lineHeight: 17 }}
              >
                {t('profil.kycRequiredBody')}
              </Text>
              <Pressable onPress={() => router.push('/kyc/intro')} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary }}>
                  {t('profil.verifyNow')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Same fix as profil/edit : SafeAreaView only claims the top edge, so
          « Enregistrer » was hidden behind the Android nav bar. */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16 + insets.bottom,
        }}
      >
        <Button
          variant="dark"
          size="lg"
          block
          label={t('common.save')}
          onPress={onSave}
          loading={submitting}
          disabled={!dirty || selected.size === 0}
        />
      </View>

      {/* Instruction sheet — shown before a role is enabled. The switch only
          flips after « J'accepte et j'active ». */}
      <Modal
        visible={pendingRole !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingRole(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setPendingRole(null)} accessibilityLabel={t('common.close')} />
          {pendingRole && (
            <View
              style={{
                backgroundColor: colors.bg,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: 28,
                maxHeight: '85%',
              }}
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: colors.border,
                  marginBottom: 14,
                }}
              />
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text variant="dispL" style={{ fontSize: 20 }}>
                  {t(ROLE_GUIDE[pendingRole].titleKey)}
                </Text>
                <Text variant="bodyM" tone="muted" style={{ marginTop: 4, lineHeight: 20 }}>
                  {t('profil.readRules')}
                </Text>

                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.primaryDeep,
                    letterSpacing: 0.6,
                    marginTop: 18,
                    marginBottom: 8,
                  }}
                >
                  {t('profil.whatYouCanDo')}
                </Text>
                <View style={{ gap: 8 }}>
                  {ROLE_GUIDE[pendingRole].can.map((cle, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Check size={14} color={colors.primary} strokeWidth={2.5} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text }}>
                        {t(cle)}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.accentText,
                    letterSpacing: 0.6,
                    marginTop: 18,
                    marginBottom: 8,
                  }}
                >
                  {t('profil.rulesToFollow')}
                </Text>
                <View style={{ gap: 8 }}>
                  {ROLE_GUIDE[pendingRole].must.map((cle, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <ShieldCheck size={14} color={colors.accentText} strokeWidth={2.25} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text }}>
                        {t(cle)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={{ gap: 10, marginTop: 20 }}>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  label={t('profil.acceptAndEnable')}
                  onPress={confirmPending}
                />
                <Button
                  variant="ghost"
                  size="md"
                  block
                  label={t('common.cancel')}
                  onPress={() => setPendingRole(null)}
                />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
