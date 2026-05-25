import { Shell } from '@/components/admin/Shell';
import { OrdersModule } from '@/components/admin/modules/OrdersModule';

export default function OrdersPage() {
  return (
    <Shell
      title="Commandes & litiges"
      subtitle="Pipeline d'arbitrage et registre complet des transactions."
    >
      <OrdersModule />
    </Shell>
  );
}
