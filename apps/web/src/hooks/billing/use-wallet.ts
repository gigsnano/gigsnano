import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { walletService } from "@/services/billing/wallet.service";
import { queryKeys } from "@/hooks/query-keys";
import { LOW_BALANCE_THRESHOLD_CENTS } from "@/lib/ai-cost/constants";

export function useWallet(slug: string) {
  return useQuery({ queryKey: queryKeys.wallet(slug), queryFn: () => walletService.getWallet(slug) });
}
export function useWalletTransactions(slug: string) {
  return useQuery({
    queryKey: queryKeys.walletTransactions(slug),
    queryFn: () => walletService.listTransactions(slug),
  });
}
export function useTopup(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount_cents: number) => walletService.createTopup(slug, amount_cents),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.wallet(slug) });
      qc.invalidateQueries({ queryKey: queryKeys.walletTransactions(slug) });
    },
  });
}
export function useConnectStatus() {
  return useQuery({ queryKey: ["connect-status"], queryFn: () => walletService.getConnectStatus() });
}

export function deriveBalanceState(availableCents: number) {
  const isEmpty = availableCents <= 0;
  const isLow = availableCents <= LOW_BALANCE_THRESHOLD_CENTS;
  return { availableCents, isLow, isEmpty };
}

/** Shared balance selector so the top-bar pill and chat notice agree on "low". */
export function useWalletBalance(slug: string) {
  const { data, isPending } = useWallet(slug);
  const available = data?.available_cents ?? 0;
  return { ...deriveBalanceState(available), isPending };
}
