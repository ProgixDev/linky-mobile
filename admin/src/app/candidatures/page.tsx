import { Shell } from '@/components/admin/Shell';
import { LivreurApplicationsModule } from '@/components/admin/modules/LivreurApplicationsModule';

export default function CandidaturesPage() {
  return (
    <Shell
      title="Candidatures livreurs"
      subtitle="Examine les candidatures, accepte ou refuse — l'acceptation accorde le rôle livreur."
    >
      <LivreurApplicationsModule />
    </Shell>
  );
}
