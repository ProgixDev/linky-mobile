// Phase T.2 — agent-only section : leases (V1.1 coming-soon). Sellers and
// pure buyers see the gate.
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../src/lib/useRoleGuard';

export default function AgentLayout() {
  const { allowed, required } = useRoleGuard('agent');
  if (!allowed) return <RoleGateView required={required} surfaceLabel="cet espace agent" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
