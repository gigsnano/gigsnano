import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { intakeService } from "@/services/intake/intake.service";
import type {
  IAcceptTriagePayload,
  ICaptureTriagePayload,
  ICreateCustomerPayload,
  IPublicIntakePayload,
} from "@/types";

import { queryKeys } from "../query-keys";

export function useTriageQueue(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.triage(workspaceSlug),
    queryFn: () => intakeService.getTriage(workspaceSlug),
  });
}

export function useCustomers(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.customers(workspaceSlug),
    queryFn: () => intakeService.getCustomers(workspaceSlug),
  });
}

export function useCreateCustomer(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateCustomerPayload) =>
      intakeService.createCustomer(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers(workspaceSlug) });
    },
  });
}

export function useCreateIntakeLink(workspaceSlug: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- minting a link caches nothing to invalidate.
  return useMutation({
    mutationFn: () => intakeService.createIntakeLink(workspaceSlug),
  });
}

export function useSubmitPublicIntake(token: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- unauthenticated submitter has no app query cache.
  return useMutation({
    mutationFn: (payload: IPublicIntakePayload) =>
      intakeService.submitPublicIntake(token, payload),
  });
}

export function useCaptureTriage(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICaptureTriagePayload) => intakeService.capture(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triage(workspaceSlug) });
    },
  });
}

export function useProcessTriage(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => intakeService.process(workspaceSlug, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triage(workspaceSlug) });
    },
  });
}

export function useAcceptTriage(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: IAcceptTriagePayload }) =>
      intakeService.accept(workspaceSlug, itemId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triage(workspaceSlug) });
    },
  });
}

export function useDismissTriage(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => intakeService.dismiss(workspaceSlug, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triage(workspaceSlug) });
    },
  });
}
