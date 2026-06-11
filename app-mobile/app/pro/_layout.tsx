// Phase T.2 — pro section is for sellers AND agents. A pure buyer hitting
// any /pro/* route lands on the gate view ("Réservé aux vendeurs"), not on
// a broken dashboard. Multi-role users pass through unchanged.
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../src/lib/useRoleGuard';

export default function ProLayout() {
  const { allowed, required } = useRoleGuard(['seller', 'agent']);
  if (!allowed) return <RoleGateView required={required} surfaceLabel="ce tableau de bord" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
