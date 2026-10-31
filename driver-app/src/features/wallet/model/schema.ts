import { z } from 'zod';

/**
 * Wire shape of `livreur-wallet` (linky-mobile/app-mobile/supabase/functions/livreur-wallet).
 * Validated at this trust boundary; unknown extra fields are ignored.
 */
export const WalletEntryWireSchema = z.object({
  id: z.string(),
  direction: z.enum(['credit', 'debit']),
  amount_minor: z.number(),
  ref_type: z.string(),
  order_reference: z.string().nullable().optional(),
  created_at: z.string(),
});

export const WithdrawalStatusSchema = z.enum([
  'pending',
  'approved',
  'paid',
  'rejected',
  'cancelled',
]);

export const WithdrawalWireSchema = z.object({
  id: z.string(),
  amount_minor: z.number(),
  status: WithdrawalStatusSchema.catch('approved'),
  destination: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  created_at: z.string(),
  decided_at: z.string().nullable().optional(),
  cancellable: z.boolean().optional(),
});

export const WalletWireSchema = z.object({
  balance_minor: z.number(),
  entries: z.array(WalletEntryWireSchema),
  withdrawals: z.array(WithdrawalWireSchema),
});

export type WalletEntry = z.infer<typeof WalletEntryWireSchema>;
export type Withdrawal = z.infer<typeof WithdrawalWireSchema>;
export type WithdrawalStatus = z.infer<typeof WithdrawalStatusSchema>;
export type Wallet = z.infer<typeof WalletWireSchema>;
