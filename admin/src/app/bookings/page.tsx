import { Shell } from '@/components/admin/Shell';
import { BookingsModule } from '@/components/admin/modules/BookingsModule';

export default function BookingsPage() {
  return (
    <Shell
      title="Réservations"
      subtitle="Locations en séquestre : rembourse le locataire ou verse le loyer au propriétaire."
    >
      <BookingsModule />
    </Shell>
  );
}
