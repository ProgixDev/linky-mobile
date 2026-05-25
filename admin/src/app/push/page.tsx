import { Shell } from '@/components/admin/Shell';
import { PushModule } from '@/components/admin/modules/PushModule';

export default function PushPage() {
  return (
    <Shell
      title="Push notifications"
      subtitle="Compose, cible, programme. Aperçu mobile en temps réel."
    >
      <PushModule />
    </Shell>
  );
}
