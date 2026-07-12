import { Shell } from '@/components/admin/Shell';
import { ModerationModule } from '@/components/admin/modules/ModerationModule';

export default function ModerationPage() {
  return (
    <Shell
      title="Modération"
      subtitle="Supprime les commentaires et avis abusifs."
    >
      <ModerationModule />
    </Shell>
  );
}
