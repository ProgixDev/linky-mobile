import { Shell } from '@/components/admin/Shell';
import { BannersModule } from '@/components/admin/modules/BannersModule';

export default function BannersPage() {
  return (
    <Shell title="Bannières" subtitle="Composer et planifier les bannières in-app.">
      <BannersModule />
    </Shell>
  );
}
