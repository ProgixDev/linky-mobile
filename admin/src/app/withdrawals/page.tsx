import { Shell } from '@/components/admin/Shell';
import { WithdrawalsModule } from '@/components/admin/modules/WithdrawalsModule';

export default function WithdrawalsPage() {
  return (
    <Shell
      title="Retraits"
      subtitle="Envoie le transfert mobile money, puis marque la demande payée."
    >
      <WithdrawalsModule />
    </Shell>
  );
}
