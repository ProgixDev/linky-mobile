// Phase T.2 — seller-only section : payouts, seller orders, refunds.
// Agents and pure buyers see the gate, not leaked seller UI.
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../src/lib/useRoleGuard';

export default function SellerLayout() {
  const { allowed, required } = useRoleGuard('seller');
  if (!allowed) return <RoleGateView required={required} surfaceLabel="cet espace vendeur" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
