// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// boost multipliers + fake view counts from mockProducts.
import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function BoostRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="bolt"
      title={t('pro.boostScreenTitle')}
      blurb={t('pro.boostScreenBlurb')}
    />
  );
}
