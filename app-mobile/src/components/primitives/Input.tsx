import { useRef, useState } from 'react';
import {
  TextInput,
  View,
  Pressable,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from './Text';
import { I } from '../../icons/Icon';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  leadingIcon?: keyof typeof I;
  trailingIcon?: keyof typeof I;
  onTrailingPress?: () => void;
  errorText?: string;
  helperText?: string;
  compact?: boolean;
  rounded?: boolean;
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({
  label,
  leadingIcon,
  trailingIcon,
  onTrailingPress,
  errorText,
  helperText,
  compact,
  rounded,
  multiline,
  containerStyle,
  ...rest
}: InputProps) {
  const { colors, radii } = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const Leading = leadingIcon ? I[leadingIcon] : null;
  const Trailing = trailingIcon ? I[trailingIcon] : null;
  return (
    <View style={containerStyle}>
      {label && (
        <Text variant="micro" tone="muted" style={{ marginBottom: 6, textTransform: 'none' }}>
          {label}
        </Text>
      )}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{
          height: multiline ? undefined : compact ? 44 : 48,
          minHeight: multiline ? 100 : undefined,
          borderRadius: rounded ? 999 : radii.md,
          backgroundColor: colors.bgElev,
          borderWidth: 1,
          borderColor: errorText ? colors.danger : focused ? colors.primary : colors.border,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
        }}
      >
        {Leading && (
          <View style={{ marginRight: 10 }}>
            <Leading size={18} color={colors.textMuted} />
          </View>
        )}
        <TextInput
          ref={inputRef}
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.textFaint}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 14,
            paddingVertical: 0,
            minHeight: multiline ? 96 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {Trailing && (
          <Pressable onPress={onTrailingPress} hitSlop={10} style={{ marginLeft: 10 }}>
            <Trailing size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
      {errorText ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 6 }}>
          {errorText}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

export function OTPCells({
  length = 6,
  value,
  onChange,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const ref = useRef<TextInput>(null);
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}
      accessibilityRole="text"
      accessibilityLabel={t('a11y.otpCode')}
    >
      {Array.from({ length }).map((_, i) => {
        const ch = value[i] ?? '';
        const isFocus = value.length === i;
        return (
          <View
            key={i}
            style={{
              width: 44,
              height: 56,
              borderRadius: radii.md,
              borderWidth: isFocus ? 2 : 1,
              borderColor: isFocus ? colors.primary : colors.border,
              backgroundColor: colors.bgElev,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="dispL" tabnum>
              {ch}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        maxLength={length}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
      />
    </Pressable>
  );
}
