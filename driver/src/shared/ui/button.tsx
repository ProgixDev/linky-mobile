import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';

import { AppText } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'md' | 'sm';

const containerClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'bg-brand-50 active:bg-brand-100',
  ghost: 'bg-transparent active:bg-surface-muted',
  destructive: 'bg-danger active:opacity-90',
};

const labelClasses: Record<Variant, string> = {
  primary: 'text-ink-inverse',
  secondary: 'text-brand-700',
  ghost: 'text-brand-600',
  destructive: 'text-ink-inverse',
};

const sizeClasses: Record<Size, string> = {
  md: 'h-12 px-5',
  sm: 'h-9 px-3',
};

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center rounded-control',
        containerClasses[variant],
        sizeClasses[size],
        isDisabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary' || variant === 'destructive' ? colors.inkInverse : colors.brand600
          }
        />
      ) : (
        <AppText variant="label" className={cn('text-center', labelClasses[variant])}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
