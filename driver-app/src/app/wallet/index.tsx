import { WalletScreen } from '@/features/wallet';

/**
 * Routes stay THIN — the wallet (delivery earnings, withdrawals) lives in
 * src/features/wallet. See docs/architecture/module-boundaries.md
 */
export default function WalletRoute() {
  return <WalletScreen />;
}
