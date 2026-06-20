// Feature flags. Compile-time constants today — a remote-config hook can
// land later without touching call sites. Keep flag bodies minimal : if a
// flag needs branching logic, write a helper next to it instead of nesting
// conditionals in this file.

// P2P wallet send (wallet-to-wallet money transfer between Linky accounts).
// SHIPPED 2026-06-20 but GATED OFF — the ledger is sound (post_transfer is
// the same primitive escrow uses, atomic + double-entry) but AML/abuse
// gating is incomplete. See linky-mobile/WALLET_SEND_V1_1_BACKLOG.md for
// the full must-fix list before flipping this on.
export const P2P_SEND_ENABLED = false;
