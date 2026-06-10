// Phase P.4 — KYC status + hosted-session start (Didit).
//
// The pending screen polls every 2.5s while a session is open — the server
// throttles its own Didit lookups (10s stale window), so the poll is cheap.
// Everything else reads the cached ['kyc-status'] entry.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../stores/auth';

export type KycStatus = 'none' | 'pending' | 'in_review' | 'approved' | 'declined';

export interface KycStatusResult {
  kycStatus: KycStatus;
  sessionStatus: string | null;
}

interface KycStatusResponse {
  kyc_status: KycStatus;
  session: { status: string; updated_at: string } | null;
}

export interface KycStartResult {
  kycStatus: KycStatus;
  url: string | null;
}

interface KycStartResponse {
  kyc_status: KycStatus;
  session: { url: string | null; status: string } | null;
}

export function useKycStatus(opts?: { poll?: boolean }) {
  const authed = useAuth((s) => !!s.user);
  return useQuery({
    queryKey: ['kyc-status'],
    enabled: authed,
    queryFn: async (): Promise<KycStatusResult> => {
      const r = await apiPost<KycStatusResponse>({ path: '/kyc-status', body: {} });
      return { kycStatus: r.kyc_status, sessionStatus: r.session?.status ?? null };
    },
    refetchInterval: opts?.poll
      ? (query) => {
          const s = query.state.data?.kycStatus;
          // Keep polling until a terminal state lands (or first data arrives).
          return s === undefined || s === 'pending' || s === 'in_review' ? 2500 : false;
        }
      : undefined,
  });
}

export function useStartKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<KycStartResult> => {
      const r = await apiPost<KycStartResponse>({ path: '/kyc-start', body: {} });
      return { kycStatus: r.kyc_status, url: r.session?.url ?? null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kyc-status'] }),
  });
}
