import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Input } from '../primitives/Input';
import { Switch } from '../primitives/Switch';
import { MicroLabel } from '../lists/SectionHeader';
import { formatGNF } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import {
  DAY_BLOCKS,
  MONTH_TIERS,
  perNightHint,
  isPointless,
  type RentalTermsDraft,
  type DepositBasis,
  type DepositKind,
} from '../../lib/rentalTermsDraft';

// Les CONDITIONS d'une location : caution, séjour minimum, tarif par durée.
// Partagé par le tunnel de création et l'écran de modification — les écrire
// deux fois, c'est les voir diverger, et c'est le bailleur qui découvrirait
// l'écart en publiant.
//
// ┌─ LE TARIF PAR DURÉE : IL NE SAISIT AUCUNE REMISE ────────────────────────┐
// Le client nous a laissé la forme (« j'ai pas d'idée, je te laisse faire »).
// Il donne ses PRIX — la nuit, la semaine, le mois — et le moteur cherche pour
// le locataire la combinaison la moins chère. C'est ainsi qu'il raisonne
// lui-même : son exemple dit « ils ont baissé à 8 000 000 par mois », jamais
// un pourcentage.
//
// La ligne grise sous chaque champ traduit aussitôt ce qu'il vient de taper
// (« soit 400 000 la nuit »). C'est elle qui rend la saisie utilisable sans
// mode d'emploi : il tape le nombre rond qu'il a en tête et lit ce que ça veut
// dire, au lieu de calculer un pourcentage de tête.
// └──────────────────────────────────────────────────────────────────────────┘

const BASES: { id: DepositBasis; labelKey: string }[] = [
  { id: 'amount', labelKey: 'create.depositBasisAmount' },
  { id: 'months', labelKey: 'create.depositBasisMonths' },
  { id: 'percent', labelKey: 'create.depositBasisPercent' },
];

const KINDS: { id: DepositKind; labelKey: string }[] = [
  { id: 'caution', labelKey: 'create.depositKindCaution' },
  { id: 'agency_fee', labelKey: 'create.depositKindAgency' },
];

export function RentalTermsFields({
  period,
  basePriceGnf,
  value,
  onChange,
}: {
  period: 'day' | 'month';
  basePriceGnf: number;
  value: RentalTermsDraft;
  onChange: (next: RentalTermsDraft) => void;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const set = (patch: Partial<RentalTermsDraft>) => onChange({ ...value, ...patch });

  // « 2 mois de caution » n'a aucun sens sur une annonce à la journée : la base
  // le refuse, autant ne pas le proposer.
  const bases = period === 'day' ? BASES.filter((b) => b.id !== 'months') : BASES;
  const units = period === 'day' ? DAY_BLOCKS : MONTH_TIERS;
  const rateKind = period === 'day' ? 'block' : 'tier';

  return (
    <View style={{ gap: 14 }}>
      {/* ── CAUTION / GARANTIE ───────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <ToggleLine
          label={t('create.depositTitle')}
          hint={t('create.depositHint')}
          value={value.depositEnabled}
          onChange={(v) => set({ depositEnabled: v })}
        />

        {value.depositEnabled && (
          <View style={{ gap: 10 }}>
            <ChipRow
              options={bases.map((b) => ({ id: b.id, label: t(b.labelKey) }))}
              selected={value.depositBasis}
              onSelect={(id) => set({ depositBasis: id as DepositBasis, depositValue: id === 'months' ? 1 : 0 })}
            />
            <Input
              label={t(
                value.depositBasis === 'amount'
                  ? 'create.depositValueAmount'
                  : value.depositBasis === 'months'
                    ? 'create.depositValueMonths'
                    : 'create.depositValuePercent',
              )}
              value={
                value.depositBasis === 'percent'
                  ? String(value.depositValue / 100)
                  : value.depositBasis === 'amount'
                    ? new Intl.NumberFormat('fr-FR').format(value.depositValue)
                    : String(value.depositValue)
              }
              onChangeText={(txt) => {
                const n = Number(txt.replace(/\D/g, '')) || 0;
                // Le pourcentage se SAISIT en pour-cent et se STOCKE en points
                // de base : 10 tapé, 1000 enregistré. Un seul endroit fait la
                // conversion, ici.
                set({ depositValue: value.depositBasis === 'percent' ? n * 100 : n });
              }}
              keyboardType="number-pad"
              helperText={depositHint(value, basePriceGnf, t)}
            />
            {/* LA NATURE DU DÉPÔT DÉCIDE DE LA CLAUSE DU CONTRAT. Le client a
                mis « 2 mois de caution » et « 10 % de frais d'agence » sous la
                même case : ce sont deux choses opposées, l'une revient au
                locataire, l'autre jamais. Promettre une restitution sur des
                frais d'agence serait faux dans un document signé. */}
            <ChipRow
              options={KINDS.map((k) => ({ id: k.id, label: t(k.labelKey) }))}
              selected={value.depositKind}
              onSelect={(id) => set({ depositKind: id as DepositKind })}
            />
          </View>
        )}
      </View>

      {/* ── SÉJOUR MINIMUM ───────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <ToggleLine
          label={t('create.minStayTitle')}
          hint={t(period === 'day' ? 'create.minStayHintDay' : 'create.minStayHintMonth')}
          value={value.minStayEnabled}
          onChange={(v) => set({ minStayEnabled: v })}
        />
        {value.minStayEnabled && (
          <Input
            label={t(period === 'day' ? 'create.minStayNights' : 'create.minStayMonths')}
            value={String(value.minStay)}
            onChangeText={(txt) => set({ minStay: Math.max(0, Number(txt.replace(/\D/g, '')) || 0) })}
            keyboardType="number-pad"
          />
        )}
      </View>

      {/* ── TARIF PAR DURÉE ──────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <MicroLabel label={t('create.ratesTitle')} />
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', marginTop: -6 }}>
          {t(period === 'day' ? 'create.ratesHintDay' : 'create.ratesHintMonth')}
        </Text>
        {units.map((u) => {
          const key = rateKind + ':' + u;
          const price = value.rates[key] ?? 0;
          const hint = period === 'day' ? perNightHint(price, u) : null;
          const pointless = period === 'day' && isPointless(price, u, basePriceGnf);
          return (
            <Input
              key={key}
              label={t(period === 'day' ? 'create.ratePriceForNights' : 'create.ratePriceFromMonths', { count: u })}
              value={price ? new Intl.NumberFormat('fr-FR').format(price) : ''}
              onChangeText={(txt) =>
                set({ rates: { ...value.rates, [key]: Number(txt.replace(/\D/g, '')) || 0 } })
              }
              keyboardType="number-pad"
              placeholder={t('create.ratePlaceholder')}
              // Un tarif plus cher que le plein ne sera JAMAIS retenu par le
              // moteur — il prend un minimum. Ce n'est pas une faute, mais le
              // bailleur croit avoir fait une remise : on le lui dit.
              helperText={
                pointless
                  ? t('create.rateNoDiscount')
                  : hint
                    ? t('create.ratePerNight', { amount: formatGNF(hint) })
                    : undefined
              }
            />
          );
        })}
      </View>
    </View>
  );
}

/** Ce que la caution vaudra réellement, en francs, dès qu'on peut le dire. */
function depositHint(
  v: RentalTermsDraft,
  basePriceGnf: number,
  t: (k: string, o?: Record<string, unknown>) => string,
): string | undefined {
  if (!v.depositValue || v.depositValue <= 0) return undefined;
  if (v.depositBasis === 'months' && basePriceGnf > 0) {
    return t('create.depositPreview', { amount: formatGNF(v.depositValue * basePriceGnf) });
  }
  if (v.depositBasis === 'percent') {
    // On ne peut PAS donner un montant ici : le pourcentage porte sur le loyer
    // de la durée réservée, qui dépend du séjour que choisira le locataire.
    // Annoncer un chiffre faux serait pire que de n'en annoncer aucun.
    return t('create.depositPercentHint');
  }
  return undefined;
}

function ToggleLine({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{label}</Text>
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
          {hint}
        </Text>
      </View>
      <Switch
        value={value}
        onChange={(v: boolean) => {
          haptic.light();
          onChange(v);
        }}
      />
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { colors, radii } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.id === selected;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              haptic.light();
              onSelect(o.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: on ? 2 : 1,
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? colors.primarySoft : colors.card,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? colors.primaryDeep : colors.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
