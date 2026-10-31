import { apiPost } from '@/shared/lib/api';

import { WalletWireSchema, type Wallet } from '../model/schema';

/**
 * The signed-in courier's wallet: balance, recent movements, withdrawals. The
 * request carries no identity — the function reads the JWT and only ever touches
 * the 'livreur' wallet (delivery earnings), never the courier's Linky wallets.
 */
export async function fetchWallet(): Promise<Wallet> {
  const data = await apiPost<unknown>({ path: '/livreur-wallet' });
  const parsed = WalletWireSchema.safeParse(data);
  if (!parsed.success) throw new Error('Unexpected wallet response');
  return parsed.data;
}

/**
 * Ask for a withdrawal. The server holds the money at once (status 'approved')
 * and refuses anything above the balance. Errors surface as ApiError with a
 * French message (INSUFFICIENT_FUNDS, DESTINATION_REQUIRED…).
 */
export async function requestWithdrawal(amountMinor: number, destination: string): Promise<void> {
  await apiPost<unknown>({
    path: '/livreur-wallet-withdraw',
    body: { amount_minor: amountMinor, destination },
  });
}

/**
 * Cancel a withdrawal while the money has not left. Shared with the Linky app:
 * the database lock refuses once a payout is reserved or in flight.
 */
export async function cancelWithdrawal(requestId: string): Promise<void> {
  await apiPost<unknown>({ path: '/wallet-withdraw-cancel', body: { request_id: requestId } });
}
