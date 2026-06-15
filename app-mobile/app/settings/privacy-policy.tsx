import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LegalDoc } from '../../src/components/dashboards/LegalDoc';

// Phase I.9 — stable defs ; the visible heading/body is resolved at render
// time via t() so the legal doc flips language with Langue.
const SECTION_DEFS: { headingKey: string; bodyKey: string }[] = [
  { headingKey: 'legal.priv1H', bodyKey: 'legal.priv1B' },
  { headingKey: 'legal.priv2H', bodyKey: 'legal.priv2B' },
  { headingKey: 'legal.priv3H', bodyKey: 'legal.priv3B' },
  { headingKey: 'legal.priv4H', bodyKey: 'legal.priv4B' },
  { headingKey: 'legal.priv5H', bodyKey: 'legal.priv5B' },
  { headingKey: 'legal.priv6H', bodyKey: 'legal.priv6B' },
  { headingKey: 'legal.priv7H', bodyKey: 'legal.priv7B' },
  { headingKey: 'legal.priv8H', bodyKey: 'legal.priv8B' },
  { headingKey: 'legal.priv9H', bodyKey: 'legal.priv9B' },
];

export default function PrivacyPolicyRoute() {
  const { t } = useTranslation();
  const sections = useMemo(
    () => SECTION_DEFS.map((d) => ({ heading: t(d.headingKey), body: t(d.bodyKey) })),
    [t],
  );
  return (
    <LegalDoc
      title={t('legal.privacyTitle')}
      updated={t('legal.privacyUpdated')}
      sections={sections}
    />
  );
}
