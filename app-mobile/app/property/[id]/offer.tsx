// Phase U.0-B2 — pre-U0 this screen rendered mockProperties[0]'s price as
// «PRIX DEMANDÉ», pre-filled an offer at 92 % of the mock, and
// «Envoyer l'offre» was haptic + router.back() — sent nothing. No offers
// backend exists in V1. Convert to honest ComingSoonScreen and remove the
// CTAs that route here from property/[id]/index.tsx.
import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function OfferRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="building"
      title={t('property.makeOfferTitle')}
      blurb={t('property.makeOfferBlurb')}
    />
  );
}
