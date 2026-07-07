// Lengopay wire types — VERIFIED against the live production API on
// 2026-07-07 with the merchant's real licence (probe transcript in the
// launch-sprint notes):
//
//   Create : POST https://portal.lengopay.com/api/v1/payments
//            headers  Authorization: Basic {licence}   (raw key, no base64-of-pair)
//            body     { websiteid, amount, currency }  (amount number or string)
//            200 →    { status:'Success', pay_id, payment_url }
//            400 →    { status:'ERROR', message } ('Missing body fields',
//                     'Unsupported amount' — amounts must be ≥ some floor;
//                     100 GNF was refused, 1000 GNF accepted)
//   Status : POST https://portal.lengopay.com/api/v1/transaction/status
//            body     { pay_id, websiteid }
//            200 →    { status:'INITIATED'|..., pay_id, gateway, account, amount, date }
//
// The buyer completes the payment ON Lengopay's hosted page (payment_url —
// they pick Orange Money / MTN MoMo there), so init needs no phone/gateway.
// pay_id is base64 WITH padding — never decode or re-encode it.

export type LengopayMethod = 'orange-money' | 'mtn-money' | 'card';
export type LengopayCurrency = 'GNF' | 'EUR';

/** Our normalized rail status (client normalizes Lengopay's wire casing). */
export type LengopayIntentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface LengopayInitRequest {
  /** Integer minor units (GNF has no decimals — minor == major). */
  amount_minor: number;
  currency: LengopayCurrency;
}

export interface LengopayInitResponse {
  pay_id: string;
  /** Hosted payment page (https://payment.lengopay.com/{pay_id}). */
  payment_url: string;
  status: LengopayIntentStatus; // normalized ('pending' right after init)
}

export interface LengopayStatusResponse {
  pay_id: string;
  status: LengopayIntentStatus; // normalized
  message: string;
  error_code?: string;
}

/**
 * Wire → normalized status. Conservative default: anything unknown stays
 * 'pending' so the 15-min TTL sweep (not a mis-mapping) decides the outcome.
 * Wire values observed/documented: INITIATED (fresh link, unpaid), PENDING,
 * SUCCESS, FAILED, CANCELLED/CANCELED, EXPIRED. Some deployments return
 * numeric statuses — treat non-strings as pending.
 */
export function normalizeLengopayStatus(raw: unknown): LengopayIntentStatus {
  if (typeof raw !== 'string') return 'pending';
  switch (raw.toUpperCase()) {
    case 'SUCCESS':
    case 'SUCCESSFUL':
      return 'success';
    case 'FAILED':
    case 'FAILURE':
      return 'failed';
    case 'CANCELLED':
    case 'CANCELED':
    case 'EXPIRED':
      return 'cancelled';
    case 'INITIATED':
    case 'PENDING':
    case 'PROCESSING':
    default:
      return 'pending';
  }
}
