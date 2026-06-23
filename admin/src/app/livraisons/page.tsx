import { Shell } from '@/components/admin/Shell';
import { DeliveriesModule } from '@/components/admin/modules/DeliveriesModule';

export default function LivraisonsPage() {
  return (
    <Shell
      title="Livraisons"
      subtitle="Assigne les livraisons aux livreurs approuvés et suis celles en cours."
    >
      <DeliveriesModule />
    </Shell>
  );
}
