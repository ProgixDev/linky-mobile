import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function LeaseDetailRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="building"
      title={t('pro.leasesScreenTitle')}
      blurb={t('pro.leasesScreenBlurbDetail')}
    />
  );
}
