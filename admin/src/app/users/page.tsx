import { Shell } from '@/components/admin/Shell';
import { UsersModule } from '@/components/admin/modules/UsersModule';

export default function UsersPage() {
  return (
    <Shell
      title="Utilisateurs"
      subtitle="Annuaire complet des comptes Linky : acheteurs, vendeurs, agents."
    >
      <UsersModule />
    </Shell>
  );
}
