// Phase T.2 — "Mes rôles" toggle screen. The promised-but-missing one that
// onboarding's profile-setup escape ("Va dans Profil → Rôles") used to point
// to. Three role toggles ; at least one must remain ON ; enabling seller or
// agent while unverified shows a KYC nudge inline.
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, ShoppingBag, Store, Building2, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Switch } from '../../src/components/primitives/Switch';
import { useAuth, type UserRole } from '../../src/stores/auth';
import { useUpdateProfile } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { useKycStatus } from '../../src/data/queries';

const ROW_DEFS: { role: UserRole; label: string; desc: string; Icon: typeof Store }[] = [
  { role: 'buyer', label: 'Acheteur', desc: 'Acheter et louer sur Linky', Icon: ShoppingBag },
  { role: 'seller', label: 'Vendeur', desc: 'Publier des produits', Icon: Store },
  { role: 'agent', label: 'Agent immobilier', desc: 'Publier des biens', Icon: Building2 },
];

export default function RolesRoute() {
  const { colors } = useTheme();
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

  const toggle = (r: UserRole) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) {
        // Refuse to remove the last role — would violate the non-empty CHECK
        // server-side anyway, but better to block at the UI than to surface a
        // 400 from update-profile.
        if (next.size === 1) return prev;
        next.delete(r);
      } else {
        next.add(r);
      }
      return next;
    });
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
      toast.show('Rôles mis à jour.', 'success');
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
          accessibilityLabel="Retour"
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
          Mes rôles
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text variant="bodyM" tone="muted" style={{ lineHeight: 21, marginBottom: 18 }}>
          Active tout ce qui s'applique. Tu peux changer à tout moment — au moins un rôle
          doit rester actif.
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
                  {row.label}
                </Text>
                <Text
                  variant="micro"
                  tone="muted"
                  style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}
                >
                  {row.desc}
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
                Vérification requise pour publier
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{ letterSpacing: 0, textTransform: 'none', marginTop: 4, lineHeight: 17 }}
              >
                Tu peux activer le rôle maintenant, mais il faudra vérifier ton identité avant
                de publier ta première annonce.
              </Text>
              <Pressable onPress={() => router.push('/kyc/intro')} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary }}>
                  Vérifier maintenant →
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
        <Button
          variant="dark"
          size="lg"
          block
          label="Enregistrer"
          onPress={onSave}
          loading={submitting}
          disabled={!dirty || selected.size === 0}
        />
      </View>
    </SafeAreaView>
  );
}
