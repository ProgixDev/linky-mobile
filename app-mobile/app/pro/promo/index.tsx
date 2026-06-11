// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// promo codes with fake usage counts.
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function PromoRoute() {
  return (
    <ComingSoonScreen
      icon="bolt"
      title="Codes promo"
      blurb="Bientôt tu pourras créer des codes de réduction pour fidéliser tes acheteurs — pourcentage ou montant fixe, durée limitée."
    />
  );
}
