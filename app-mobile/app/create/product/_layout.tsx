// Phase T.2 — only sellers reach the product create wizard. A buyer who
// deep-links to any step (/create/product/photos, /create/product/preview,
// etc.) sees the upgrade pitch instead of the bare wizard.
import { Stack } from 'expo-router';
import { useRoleGuard, RoleGateView } from '../../../src/lib/useRoleGuard';

export default function CreateProductLayout() {
  const { allowed, required } = useRoleGuard('seller');
  if (!allowed) return <RoleGateView required={required} surfaceLabel="publier un produit" />;
  // Phase T.2 fix — animation moved here from app/_layout.tsx so every
  // step in the wizard slides in consistently.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
