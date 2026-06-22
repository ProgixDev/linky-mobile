import { View } from 'react-native';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { AppText, TextField, type TextFieldProps } from '@/shared/ui';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
} & Omit<TextFieldProps, 'value' | 'onChangeText'>;

/**
 * A text input bound to a react-hook-form field: shows the label, wires
 * value/onChange/onBlur, and renders the validation error beneath. Works with
 * any form from useAppForm.
 */
export function ControlledField<T extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View className="gap-1">
          {label ? <AppText variant="caption">{label}</AppText> : null}
          <TextField
            testID={`field-${name}`}
            value={(field.value as string) ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            {...inputProps}
          />
          {fieldState.error ? (
            <AppText testID={`field-${name}-error`} variant="caption" className="text-danger">
              {fieldState.error.message}
            </AppText>
          ) : null}
        </View>
      )}
    />
  );
}
