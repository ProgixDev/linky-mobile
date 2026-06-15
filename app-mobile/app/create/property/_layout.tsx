// Phase T.2 — only agents reach the property create wizard. Buyers and pure
// sellers see the upgrade pitch.
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRoleGuard, RoleGateView } from '../../../src/lib/useRoleGuard';

export default function CreatePropertyLayout() {
  const { t } = useTranslation();
  const { allowed, required } = useRoleGuard('agent');
  if (!allowed) return <RoleGateView required={required} surfaceLabel={t('create.roleGateProperty')} />;
  // Phase T.2 fix — animation moved here from app/_layout.tsx so every
  // step in the wizard slides in consistently.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
