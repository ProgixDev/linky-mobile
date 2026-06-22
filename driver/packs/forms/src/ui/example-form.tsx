import { View } from 'react-native';
import { z } from 'zod';

import { AppText, Button, Screen } from '@/shared/ui';

import { ControlledField } from '../controlled-field';
import { useAppForm } from '../use-app-form';

// DESIGN: this is a usage example, not a product screen. Copy the pattern.
const ExampleSchema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().min(2, 'Too short'),
});

export function ExampleForm({ onSubmit }: { onSubmit?: (v: { email: string; name: string }) => void }) {
  const form = useAppForm(ExampleSchema, { email: '', name: '' });
  const submit = form.handleSubmit((values) => onSubmit?.(values));

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <AppText variant="display">Example form</AppText>
        <ControlledField
          control={form.control}
          name="name"
          label="Name"
          placeholder="Jane"
        />
        <ControlledField
          control={form.control}
          name="email"
          label="Email"
          placeholder="jane@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Button
          label="Submit"
          loading={form.formState.isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}
