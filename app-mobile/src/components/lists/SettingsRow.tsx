import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { I, type IconKey } from '../../icons/Icon';

export interface SettingsRowProps {
  icon?: IconKey;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export function SettingsRow({
  icon,
  label,
  sub,
  value,
  onPress,
  right,
  showChevron = true,
  danger,
  divider = true,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const Icon = icon ? I[icon] : null;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      {Icon && (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: danger ? 'rgba(209,79,60,0.10)' : colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} color={danger ? colors.danger : colors.text} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: danger ? colors.danger : colors.text }}>
          {label}
        </Text>
        {sub && (
          <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
            {sub}
          </Text>
        )}
      </View>
      {value && (
        <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
          {value}
        </Text>
      )}
      {right}
      {showChevron && !right && <I.chevronR size={16} color={colors.textMuted} />}
    </Pressable>
  );
}
