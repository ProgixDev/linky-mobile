import { Shell } from '@/components/admin/Shell';
import { Overview } from '@/components/admin/modules/Overview';

export default function Page() {
  return (
    <Shell title="Vue d'ensemble" subtitle="Tableau de bord opérationnel.">
      <Overview />
    </Shell>
  );
}
