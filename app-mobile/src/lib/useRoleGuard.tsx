// Phase T.2 — central role gate for whole sections of the app.
//
// Pattern: each role-scoped subtree (app/pro, app/seller, app/agent,
// app/create/product, app/create/property) has a _layout.tsx that calls
// `useRoleGuard('seller')` (or similar). Unmet → render the kind RoleGateView
// in place, so the route stays addressable (back button works, deep links
// don't 404) but the user sees a clear explanation instead of leaked pro UI.
//
// Why a component instead of a redirect: a hard redirect would hide that a
// public link was clicked, and confuse users who tap a Profil shortcut that
// happens to outlive a role downgrade. The pitch screen offers Devenir
// vendeur / Devenir agent as the recovery path.
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, type UserRole } from '../stores/auth';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../components/primitives/Text';
import { Button } from '../components/primitives/Button';
import { I, type IconKey } from '../icons/Icon';
import { ChevronLeft } from 'lucide-react-native';

export interface RoleGuardResult {
  allowed: boolean;
  // The currently-required roles ; useful for the pitch copy.
  required: UserRole[];
}

export function useRoleGuard(required: UserRole | UserRole[]): RoleGuardResult {
  const roles = useAuth((s) => s.roles);
  const reqArr = Array.isArray(required) ? required : [required];
  // Any of the required roles unlocks. Multi-role accounts naturally pass.
  const allowed = reqArr.some((r) => roles.includes(r));
  return { allowed, required: reqArr };
}

// In-page gate that explains the requirement and routes to the upgrade pitch.
// Used both by _layout.tsx (full-section block) and inline guards (boutique tab).
//
// T.2.fix — explicit plural labels per role ; the old `${roleLabel}s`
// produced "agent immobiliers". Also: when the gate accepts EITHER seller
// or agent, offer both Devenir CTAs so a pure buyer doesn't have to guess
// which role they actually need.
const ROLE_LABELS: Record<'seller' | 'agent', { sg: string; pl: string }> = {
  seller: { sg: 'vendeur', pl: 'vendeurs' },
  agent:  { sg: 'agent immobilier', pl: 'agents immobiliers' },
};

export function RoleGateView({
  required,
  surfaceLabel,
}: {
  required: UserRole[];
  // What's behind this gate, in user terms. "ces commandes", "ce tableau de
  // bord", "publier une annonce", etc. Drives the body copy.
  surfaceLabel: string;
}) {
  const { colors } = useTheme();
  const wantsSeller = required.includes('seller');
  const wantsAgent = required.includes('agent');
  // Both-allowed gate (e.g. /pro/*) uses the shop icon as a calm default and
  // offers BOTH Devenir CTAs in the action stack below.
  const icon: IconKey = wantsSeller && !wantsAgent ? 'store' : wantsAgent && !wantsSeller ? 'building' : 'store';
  const titleLabel =
    wantsSeller && wantsAgent
      ? `${ROLE_LABELS.seller.pl} ou ${ROLE_LABELS.agent.pl}`
      : wantsSeller
        ? ROLE_LABELS.seller.pl
        : ROLE_LABELS.agent.pl;
  const bodyRoles =
    wantsSeller && wantsAgent
      ? `le rôle ${ROLE_LABELS.seller.sg} ou ${ROLE_LABELS.agent.sg}`
      : wantsSeller
        ? `le rôle ${ROLE_LABELS.seller.sg}`
        : `le rôle ${ROLE_LABELS.agent.sg}`;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          {(() => {
            const Icon = I[icon] ?? I.package;
            return <Icon size={42} color={colors.primary} />;
          })()}
        </View>
        <Text variant="dispL" center style={{ fontSize: 22, lineHeight: 28 }}>
          Réservé aux {titleLabel}
        </Text>
        <Text
          variant="bodyM"
          tone="muted"
          center
          style={{ marginTop: 10, maxWidth: 300, lineHeight: 21 }}
        >
          Pour accéder à {surfaceLabel}, active {bodyRoles} dans ton profil.
          {' '}C'est gratuit et tu peux désactiver à tout moment.
        </Text>
        <View style={{ marginTop: 28, width: '100%', gap: 10, maxWidth: 320 }}>
          {wantsSeller && (
            <Button
              variant="dark"
              size="lg"
              block
              label={`Devenir ${ROLE_LABELS.seller.sg}`}
              onPress={() => router.push(`/profil/devenir?role=seller` as never)}
            />
          )}
          {wantsAgent && (
            <Button
              variant={wantsSeller ? 'outline' : 'dark'}
              size="lg"
              block
              label={`Devenir ${ROLE_LABELS.agent.sg}`}
              onPress={() => router.push(`/profil/devenir?role=agent` as never)}
            />
          )}
          <Button
            variant="ghost"
            size="md"
            block
            label="Retour à l'accueil"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
