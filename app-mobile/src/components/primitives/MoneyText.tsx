import { View, type TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from './Text';
import { formatGNF, formatEUR } from '../../lib/format';
import { gnfToEur } from '../../lib/currency';

export interface MoneyTextProps {
  amountGnf: number;
  size?: 'sm' | 'm' | 'l' | 'xl';
  inverse?: boolean;
  perMonth?: boolean;
  // Rental billing period. When set, it takes precedence over `perMonth` and
  // renders /jour or /mois. Lets daily rentals show the right unit.
  period?: 'day' | 'month';
  showSecondary?: boolean;
  align?: 'left' | 'right' | 'center';
}

const SIZES = {
  sm: { primary: 13, secondary: 10 },
  m: { primary: 16, secondary: 11 },
  l: { primary: 20, secondary: 12 },
  xl: { primary: 28, secondary: 13 },
};

export function MoneyText({
  amountGnf,
  size = 'm',
  inverse,
  perMonth,
  period,
  showSecondary = true,
  align,
}: MoneyTextProps) {
  const { colors } = useTheme();
  const sz = SIZES[size];
  const primaryColor = inverse ? '#FFFFFF' : colors.text;
  const secondaryColor = inverse ? 'rgba(255,255,255,0.75)' : colors.textMuted;
  const primaryStyle: TextStyle = {
    color: primaryColor,
    fontSize: sz.primary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: align,
  };
  const unit = period === 'day' ? '/jour' : period === 'month' || perMonth ? '/mois' : null;
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
      <Text style={primaryStyle}>
        {formatGNF(amountGnf)}
        {unit && (
          <Text style={{ fontSize: sz.secondary, fontWeight: '500', color: primaryColor, opacity: 0.85 }}>
            {' '}
            {unit}
          </Text>
        )}
      </Text>
      {showSecondary && (
        <Text style={{ color: secondaryColor, fontSize: sz.secondary, fontVariant: ['tabular-nums'] }}>
          {formatEUR(gnfToEur(amountGnf))}
        </Text>
      )}
    </View>
  );
}
