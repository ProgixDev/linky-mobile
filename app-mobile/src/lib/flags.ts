// Feature flags. Compile-time constants today — a remote-config hook can
// land later without touching call sites. Keep flag bodies minimal : if a
// flag needs branching logic, write a helper next to it instead of nesting
// conditionals in this file.

// P2P wallet send (wallet-to-wallet money transfer between Linky accounts).
// ENABLED 2026-07-01 with owner sign-off, once the must-fix AML/abuse gating
// landed: KYC gate (soft-gated on Didit), 1M GNF/24h atomic daily cap, recipient
// push, and removal of the demo-seed free-money credit. Backend enforces the
// same in wallet-send (P2P_ENABLED + post_p2p_transfer). Still open, accepted for
// the capped beta: two-account family-fraud, reversal policy — see wallet-send header.
export const P2P_SEND_ENABLED = true;
