import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import { type z } from 'zod';

/**
 * useForm pre-wired with a Zod schema. Validation, types, and default values all
 * derive from the schema — one source of truth. Returns the standard
 * react-hook-form API; pair with <ControlledField> for inputs.
 *
 *   const form = useAppForm(SignInSchema, { email: '', password: '' });
 *   const onSubmit = form.handleSubmit(async (values) => { ... });
 */
export function useAppForm<TSchema extends z.ZodType<Record<string, unknown>>>(
  schema: TSchema,
  defaultValues: DefaultValues<z.infer<TSchema>>,
  options?: Omit<UseFormProps<z.infer<TSchema>>, 'resolver' | 'defaultValues'>,
): UseFormReturn<z.infer<TSchema>> {
  return useForm<z.infer<TSchema>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues,
    mode: 'onBlur',
    ...options,
  });
}
