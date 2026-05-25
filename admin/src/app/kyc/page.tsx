import { Shell } from '@/components/admin/Shell';
import { KycModule } from '@/components/admin/modules/KycModule';

export default function KycPage() {
  return (
    <Shell
      title="KYC en attente"
      subtitle="Examine les pièces d'identité, valide ou rejette."
    >
      <KycModule />
    </Shell>
  );
}
