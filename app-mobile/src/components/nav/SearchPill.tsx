import { View, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { I } from '../../icons/Icon';
import { Text } from '../primitives/Text';

export function SearchPill({
  placeholder,
  onPress,
  onCameraPress,
}: {
  placeholder?: string;
  onPress?: () => void;
  onCameraPress?: () => void;
}) {
  const { colors } = useTheme();
  // Phase I.3a — fall back to the localized default when callers don't pass
  // a placeholder, so the pill flips with the active language.
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('common.searchPlaceholder');
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginHorizontal: 16,
        height: 44,
        borderRadius: 999,
        backgroundColor: colors.bgElev,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
      }}
      accessibilityRole="search"
    >
      <I.search size={18} color={colors.textMuted} />
      <Text variant="bodyM" tone="faint" style={{ marginLeft: 10, flex: 1 }}>
        {effectivePlaceholder}
      </Text>
      <Pressable
        onPress={onCameraPress}
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityLabel={t('a11y.searchVisual')}
      >
        <I.camera size={16} color={colors.primary} />
      </Pressable>
    </Pressable>
  );
}
