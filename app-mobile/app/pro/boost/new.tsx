import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function BoostNewRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="bolt"
      title={t('pro.boostScreenTitle')}
      blurb={t('pro.boostScreenBlurbNew')}
    />
  );
}
