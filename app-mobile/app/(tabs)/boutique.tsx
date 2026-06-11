import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Plus, Home as HomeIcon, Building2 } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  EstateDashboard,
  IdentityPill,
  ModeTab,
  ShopDashboard,
  type ProMode,
} from '../../src/components/dashboards/ProDashboard';
import { haptic } from '../../src/lib/haptics';
import { useAuth } from '../../src/stores/auth';
import { useRoleGuard, RoleGateView } from '../../src/lib/useRoleGuard';
import { useCreateListing } from '../../src/stores/createListing';

export default function BoutiqueRoute() {
  const { colors } = useTheme();
  const roles = useAuth((s) => s.roles);
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const hasBoth = isSeller && isAgent;
  // Phase T.2 — direct-nav to /(tabs)/boutique used to render the agent or
  // shop dashboard for ANY user (the boutique tab is hidden via href:null for
  // pure buyers, but a deep link bypassed that). Inline-gate here.
  const guard = useRoleGuard(['seller', 'agent']);
  const resetDraft = useCreateListing((s) => s.reset);
  const setKind = useCreateListing((s) => s.setKind);
  const [mode, setMode] = useState<ProMode>(isSeller ? 'shop' : 'estate');
  if (!guard.allowed) {
    return <RoleGateView required={guard.required} surfaceLabel="ton tableau de bord" />;
  }
  // Phase T.2 fix — `mode` is captured at first mount ; after a role change
  // while this tab stays mounted (devenir / roles flows), a pure seller
  // could be stuck on EstateDashboard with no switcher. Derive instead so
  // the rendered dashboard always matches the current role set.
  const effectiveMode: ProMode = hasBoth ? mode : isSeller ? 'shop' : 'estate';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: hasBoth ? 14 : 22,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {/* Phase U.0 should-fix — IdentityPill missed the T.2 effectiveMode
              swap ; after a role change the pill contradicted the dashboard. */}
          <IdentityPill mode={effectiveMode} />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              haptic.light();
              // Phase U.0 nit — match the chooser's reset+setKind so a FAB
              // deep-entry doesn't resume a stale abandoned draft.
              resetDraft();
              setKind(effectiveMode === 'shop' ? 'product' : 'property');
              router.push(effectiveMode === 'shop' ? '/create/product/seller' : '/create/property/details');
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              backgroundColor: colors.text,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={effectiveMode === 'shop' ? 'Nouvelle annonce' : 'Nouveau bien'}
          >
            <Plus size={20} color={colors.bg} strokeWidth={2.25} />
          </Pressable>
        </View>

        {hasBoth && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                padding: 4,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
              }}
            >
              <ModeTab
                Icon={HomeIcon}
                label="Boutique"
                active={effectiveMode === 'shop'}
                onPress={() => setMode('shop')}
              />
              <ModeTab
                Icon={Building2}
                label="Immobilier"
                active={effectiveMode === 'estate'}
                onPress={() => setMode('estate')}
              />
            </View>
          </View>
        )}

        {effectiveMode === 'shop' ? <ShopDashboard /> : <EstateDashboard />}
      </ScrollView>
    </SafeAreaView>
  );
}
