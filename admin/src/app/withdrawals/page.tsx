import { Shell } from '@/components/admin/Shell';
import { WithdrawalsModule } from '@/components/admin/modules/WithdrawalsModule';

export default function WithdrawalsPage() {
  return (
    <Shell
      title="Retraits"
      subtitle="Les demandes se valident seules et les fonds sont retenus. Envoie le transfert, puis confirme."
    >
      <WithdrawalsModule />
    </Shell>
  );
}
