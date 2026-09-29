// Phase T.2 — agent-only section : leases (V1.1 coming-soon). Sellers and
// pure buyers see the gate.
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../src/lib/useRoleGuard';

export default function AgentLayout() {
  const { t } = useTranslation();
  const { allowed, required } = useRoleGuard('agent');
  if (!allowed) return <RoleGateView required={required} surfaceLabel={t('roleGate.surfaceAgent')} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
