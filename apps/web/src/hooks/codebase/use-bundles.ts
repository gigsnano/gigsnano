import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bundleService } from "@/services/codebase/bundle.service";
import type {
  ICreateBundlePayload,
  IUpdateBundlePayload,
  IValidateBundlePayload,
} from "@/types";

import { queryKeys } from "../query-keys";

/** System Bundles for a project. */
export function useBundles(slug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.systemBundles(slug, projectId),
    queryFn: () => bundleService.listBundles(slug, projectId),
    enabled: Boolean(slug && projectId),
  });
}

export function useBundle(slug: string, projectId: string, bundleId: string) {
  return useQuery({
    queryKey: queryKeys.systemBundle(slug, projectId, bundleId),
    queryFn: () => bundleService.getBundle(slug, projectId, bundleId),
    enabled: Boolean(slug && projectId && bundleId),
  });
}

function invalidateBundles(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.systemBundles(slug, projectId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.repositories(slug, projectId) });
}

export function useCreateBundle(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateBundlePayload) =>
      bundleService.createBundle(slug, projectId, payload),
    onSuccess: () => invalidateBundles(queryClient, slug, projectId),
  });
}

export function useUpdateBundle(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bundleId, payload }: { bundleId: string; payload: IUpdateBundlePayload }) =>
      bundleService.updateBundle(slug, projectId, bundleId, payload),
    onSuccess: (_data, { bundleId }) => {
      invalidateBundles(queryClient, slug, projectId);
      queryClient.invalidateQueries({ queryKey: queryKeys.systemBundle(slug, projectId, bundleId) });
    },
  });
}

/** Validate a draft config without saving; returns the validation result. */
export function useValidateBundle(slug: string, projectId: string) {
  return useMutation({
    mutationFn: (payload: IValidateBundlePayload) =>
      bundleService.validateBundle(slug, projectId, payload),
  });
}

export function useSetDefaultBundle(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => bundleService.setDefault(slug, projectId, bundleId),
    onSuccess: () => invalidateBundles(queryClient, slug, projectId),
  });
}

export function useArchiveBundle(slug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => bundleService.archiveBundle(slug, projectId, bundleId),
    onSuccess: () => invalidateBundles(queryClient, slug, projectId),
  });
}
