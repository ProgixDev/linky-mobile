// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// tenants with fake names and fake overdue rents.
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function LeasesRoute() {
  return (
    <ComingSoonScreen
      icon="building"
      title="Suivi des baux"
      blurb="Bientôt tu suivras ici tes locations en cours — locataires, échéances, paiements."
    />
  );
}
