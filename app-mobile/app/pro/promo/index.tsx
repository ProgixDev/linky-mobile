// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// promo codes with fake usage counts.
import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function PromoRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="bolt"
      title={t('pro.promoScreenTitle')}
      blurb={t('pro.promoScreenBlurb')}
    />
  );
}
