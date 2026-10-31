import { create } from 'zustand';

import { fetchWallet } from '../lib/wallet-api';
import type { Wallet } from './schema';

type Status = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

type WalletState = {
  wallet: Wallet | null;
  status: Status;
  /** First load (skeleton) — or a refresh when a wallet is already shown. */
  load: () => Promise<void>;
};

/**
 * The courier's wallet. Not persisted: a balance must never be shown stale from
 * disk as if it were current — the card shows a skeleton until the server answers.
 */
export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  status: 'idle',

  load: async () => {
    const { status, wallet } = get();
    if (status === 'loading' || status === 'refreshing') return;
    set({ status: wallet ? 'refreshing' : 'loading' });
    try {
      const next = await fetchWallet();
      set({ wallet: next, status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
}));
