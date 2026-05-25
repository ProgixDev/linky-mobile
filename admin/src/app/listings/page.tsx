import { Shell } from '@/components/admin/Shell';
import { ListingsModule } from '@/components/admin/modules/ListingsModule';

export default function ListingsPage() {
  return (
    <Shell
      title="Annonces"
      subtitle="File d'attente de modération + table complète."
    >
      <ListingsModule />
    </Shell>
  );
}
