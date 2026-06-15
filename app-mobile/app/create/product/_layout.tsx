// Phase T.2 — only sellers reach the product create wizard. A buyer who
// deep-links to any step (/create/product/photos, /create/product/preview,
// etc.) sees the upgrade pitch instead of the bare wizard.
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRoleGuard, RoleGateView } from '../../../src/lib/useRoleGuard';

export default function CreateProductLayout() {
  const { t } = useTranslation();
  const { allowed, required } = useRoleGuard('seller');
  if (!allowed) return <RoleGateView required={required} surfaceLabel={t('create.roleGateProduct')} />;
  // Phase T.2 fix — animation moved here from app/_layout.tsx so every
  // step in the wizard slides in consistently.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
