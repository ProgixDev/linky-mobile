import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LegalDoc } from '../../src/components/dashboards/LegalDoc';

// Phase I.9 — stable defs ; the visible heading/body is resolved at render
// time via t() so the legal doc flips language with Langue.
const SECTION_DEFS: { headingKey: string; bodyKey: string }[] = [
  { headingKey: 'legal.terms1H', bodyKey: 'legal.terms1B' },
  { headingKey: 'legal.terms2H', bodyKey: 'legal.terms2B' },
  { headingKey: 'legal.terms3H', bodyKey: 'legal.terms3B' },
  { headingKey: 'legal.terms4H', bodyKey: 'legal.terms4B' },
  { headingKey: 'legal.terms5H', bodyKey: 'legal.terms5B' },
  { headingKey: 'legal.terms6H', bodyKey: 'legal.terms6B' },
  { headingKey: 'legal.terms7H', bodyKey: 'legal.terms7B' },
  { headingKey: 'legal.terms8H', bodyKey: 'legal.terms8B' },
  { headingKey: 'legal.terms9H', bodyKey: 'legal.terms9B' },
];

export default function TermsRoute() {
  const { t } = useTranslation();
  const sections = useMemo(
    () => SECTION_DEFS.map((d) => ({ heading: t(d.headingKey), body: t(d.bodyKey) })),
    [t],
  );
  return (
    <LegalDoc
      title={t('legal.termsTitle')}
      updated={t('legal.termsUpdated')}
      sections={sections}
    />
  );
}
