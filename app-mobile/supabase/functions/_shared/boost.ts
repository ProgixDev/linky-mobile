// Boost pricing — SERVER-AUTHORITATIVE. GNF minor == GNF (the currency has no
// decimals). The client only sends the chosen number of days, never a price,
// so a tampered client can't underpay. Owner-tunable: edit these numbers and
// redeploy create-boost + list-boosts.
export const BOOST_TIERS: { days: number; amount_minor: number }[] = [
  { days: 3, amount_minor: 50_000 },
  { days: 7, amount_minor: 100_000 },
  { days: 14, amount_minor: 175_000 },
  { days: 30, amount_minor: 300_000 },
];

export function boostPrice(days: number): number | undefined {
  return BOOST_TIERS.find((t) => t.days === days)?.amount_minor;
}
