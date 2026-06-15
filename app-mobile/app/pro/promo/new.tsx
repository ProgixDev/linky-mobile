import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function PromoNewRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="bolt"
      title={t('pro.promoScreenTitle')}
      blurb={t('pro.promoScreenBlurbNew')}
    />
  );
}
