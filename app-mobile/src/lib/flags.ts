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

// Wallet top-up (card/mobile-money → rechargeable spendable balance).
// REMOVED 2026-07 (wallet restructure, owner + research sign-off): a rechargeable
// balance spendable with third-party sellers meets Guinea's e-money definition
// (Loi L/2017/031/AN) and would require a BCRG EME agrément. Orders are paid
// PER-ORDER through licensed rails (Stripe card, Lengopay mobile money); the
// wallet keeps escrow status + seller earnings + withdrawals (Jumia posture).
// Backend twin: TOPUP_ENABLED=false in wallet-topup-card.
// See NOTE_CLIENT_WALLET_DECISION.pdf + RECHERCHE_WALLET_MODELE_PAIEMENT.pdf.
export const WALLET_TOPUP_ENABLED = false;

// Accueil : lecture AUTOMATIQUE des vidéos du carrousel (wifi seulement).
// COUPÉ le 2026-10-26 : la première version de l'accueil a fait passer l'app à
// un écran gris en production, publiée sans test sur téléphone. Le lecteur
// vidéo dans une liste horizontale est l'un des suspects natifs ; coupé, le
// carrousel montre la photo de l'annonce avec une icône lecture. À rallumer
// APRÈS un essai sur appareil, canal preview d'abord.
// RALLUMÉ le 2026-10-27 avec un délai d'armement de 800 ms et l'arrêt quand
// l'accueil n'est pas à l'écran — sur PREVIEW d'abord, essai sur téléphone.
export const HOME_HERO_AUTOPLAY_ENABLED = true;

// Sons dans l'application (validation / échec), joués par le lecteur
// d'expo-video SANS écran vidéo — jamais testé sur appareil. Coupé pour la
// même raison, à rallumer après un essai : provoquer une erreur et l'entendre.
export const UI_SOUNDS_ENABLED = false;
