// Feature flags. Compile-time constants today — a remote-config hook can
// land later without touching call sites. Keep flag bodies minimal : if a
// flag needs branching logic, write a helper next to it instead of nesting
// conditionals in this file.

// P2P wallet send (wallet-to-wallet money transfer between Linky accounts).
// REMOVED 2026-07-02 by client decision: person-to-person money transfer is OUT
// OF CONTRACT SCOPE and turning Linky into a money-transmitter / e-money service
// requires a BCRG licence + AML/KYC compliance we can't take on now. The wallet
// stays a marketplace balance (orders/escrow/payouts), NOT a free transfer rail.
// Kept off here + P2P_ENABLED=false in wallet-send so the Envoyer button and the
// endpoint both stay disabled. See client note: GUIDE_WALLET_P2P_RETIRE.pdf.
export const P2P_SEND_ENABLED = false;
