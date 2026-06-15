// Phase T.3 — honest "Bientôt disponible". Pre-T3 this rendered fake
// tenants with fake names and fake overdue rents.
import { useTranslation } from 'react-i18next';
import { ComingSoonScreen } from '../../../src/components/feedback/ComingSoon';

export default function LeasesRoute() {
  const { t } = useTranslation();
  return (
    <ComingSoonScreen
      icon="building"
      title={t('pro.leasesScreenTitle')}
      blurb={t('pro.leasesScreenBlurb')}
    />
  );
}
