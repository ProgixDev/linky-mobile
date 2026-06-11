// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// boost multipliers + fake view counts from mockProducts.
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function BoostRoute() {
  return (
    <ComingSoonScreen
      icon="bolt"
      title="Booster ses annonces"
      blurb="Très bientôt tu pourras mettre tes annonces en avant — paiement à la performance, plus de vues, plus de ventes. On te préviendra dès que c'est prêt."
    />
  );
}
