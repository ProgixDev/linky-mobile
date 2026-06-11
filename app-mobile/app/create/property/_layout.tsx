// Phase T.2 — only agents reach the property create wizard. Buyers and pure
// sellers see the upgrade pitch.
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../../src/lib/useRoleGuard';

export default function CreatePropertyLayout() {
  const { allowed, required } = useRoleGuard('agent');
  if (!allowed) return <RoleGateView required={required} surfaceLabel="publier un bien" />;
  // Phase T.2 fix — animation moved here from app/_layout.tsx so every
  // step in the wizard slides in consistently.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
