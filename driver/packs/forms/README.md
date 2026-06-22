# Pack: forms

Typed form machinery so every input screen stops re-inventing validation. **react-hook-form** for
state + **Zod** for rules (one schema drives types, defaults, and errors) + a `ControlledField` bound
to your `@/shared/ui` TextField with inline error text. **Key-free.**

This is a **primitive**, not a screen — it has no route. Other features import it.

## What you get

- `useAppForm(schema, defaults)` — `useForm` pre-wired with the Zod resolver; returns the standard
  react-hook-form API, fully typed from the schema.
- `ControlledField` — a `Controller`-bound input: label, value/onChange/onBlur wiring, and the
  validation error rendered beneath.
- `ExampleForm` — a copy-me usage example (not a product screen).

## Install

```
/add-feature forms
npm install react-hook-form @hookform/resolvers
```

Use it anywhere:

```tsx
const Schema = z.object({ email: z.string().email(), password: z.string().min(8) });
const form = useAppForm(Schema, { email: '', password: '' });
const onSubmit = form.handleSubmit(async (values) => { /* ... */ });

<ControlledField control={form.control} name="email" label="Email" autoCapitalize="none" />
<Button label="Sign in" loading={form.formState.isSubmitting} onPress={() => void onSubmit()} />
```

## Why

Validate at the edge with Zod (the skeleton's rule), keep error UX consistent, and never ship a form
that submits invalid data. Pairs naturally with `auth-screens`, `profile-settings`, `cart-checkout`,
and any create/edit screen.
