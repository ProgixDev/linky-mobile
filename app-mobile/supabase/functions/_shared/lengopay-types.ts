// Shared Lengopay-shaped types. Used by mock-lengopay (Phase I.2) and
// _shared/lengopay.ts real client (Phase I.3). Mirrors Lengopay v2 Cash-In
// surface as understood from documentation.lengopay.com + lengopay_flutter
// pub.dev research during Phase I discovery. Real API may differ in field
// names once sandbox access lands — types adjust then, contract stays.

export type LengopayMethod = 'orange-money' | 'mtn-money' | 'card';
export type LengopayAccountType = 'lp-om-gn' | 'lp-momo-gn' | 'lp-card-gn';
export type LengopayCurrency = 'GNF' | 'EUR';

/**
 * Lengopay's wire-format status. Maps to our payment_intents.status as:
 *   Lengopay 'pending'   → our 'pending'
 *   Lengopay 'success'   → our 'completed'    (we use "completed" because
 *                                              order.status is 'released'
 *                                              after escrow split — avoid
 *                                              name collision)
 *   Lengopay 'failed'    → our 'failed'
 *   Lengopay 'cancelled' → our 'cancelled'
 * Our 'expired' status is internal-only (15-min TTL per Q7). Lengopay
 * never returns 'expired'; the cron worker assigns it locally when
 * created_at < now() - interval '15 min' and rail still says 'pending'.
 */
export type LengopayIntentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface LengopayInitRequest {
  /** Stringified integer in minor units. E.g. '4944000' for 4 944 000 GNF.
   *  Real client serializes via amount_minor.toString(). Mock just stores. */
  amount: string;
  currency: LengopayCurrency;
  website_id: string;
  account_type: LengopayAccountType;
  account_number: string;   // E.164 phone
  callback_url?: string;    // Undefined — polling-primary per Q2 lock
}

export interface LengopayInitResponse {
  pay_id: string;           // Lengopay's intent reference
  status: LengopayIntentStatus;
  message: string;
}

export interface LengopayStatusResponse {
  pay_id: string;
  status: LengopayIntentStatus;
  message: string;
  error_code?: string;      // populated on failed/cancelled responses
}

export function methodToAccountType(method: LengopayMethod): LengopayAccountType {
  switch (method) {
    case 'orange-money': return 'lp-om-gn';
    case 'mtn-money':    return 'lp-momo-gn';
    case 'card':         return 'lp-card-gn';
  }
}
