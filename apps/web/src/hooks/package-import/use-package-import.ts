"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { packageImportService } from "@/services/package-import/package-import.service";
import type {
  IUpdateFindingPayload,
  IUpdatePackageDocumentPayload,
  IUploadPackagePayload,
} from "@/types";

import { queryKeys } from "../query-keys";

export function useDocumentPackage(
  workspaceSlug: string,
  projectId: string,
  packageId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.documentPackage(workspaceSlug, projectId, packageId ?? ""),
    queryFn: () => packageImportService.getPackage(workspaceSlug, projectId, packageId!),
    enabled: Boolean(packageId),
  });
}

export function usePackageFindings(
  workspaceSlug: string,
  projectId: string,
  packageId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.packageFindings(workspaceSlug, projectId, packageId ?? ""),
    queryFn: () => packageImportService.getFindings(workspaceSlug, projectId, packageId!),
    enabled: Boolean(packageId),
  });
}

export function useUploadPackage(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUploadPackagePayload) =>
      packageImportService.uploadPackage(workspaceSlug, projectId, payload),
    onSuccess: (pkg) => {
      queryClient.setQueryData(
        queryKeys.documentPackage(workspaceSlug, projectId, pkg.id),
        pkg,
      );
    },
  });
}

export function useAnalysePackage(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, documentId }: { packageId: string; documentId?: string }) =>
      packageImportService.analysePackage(workspaceSlug, projectId, packageId, documentId),
    onSuccess: (analysis) => {
      queryClient.setQueryData(
        queryKeys.packageFindings(workspaceSlug, projectId, analysis.package_id),
        analysis,
      );
      // Analysis rewrites each document's classification, so the package view is stale.
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentPackage(workspaceSlug, projectId, analysis.package_id),
      });
    },
  });
}

export function useUpdatePackageDocument(
  workspaceSlug: string,
  projectId: string,
  packageId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      payload,
    }: {
      documentId: string;
      payload: IUpdatePackageDocumentPayload;
    }) =>
      packageImportService.updateDocument(
        workspaceSlug,
        projectId,
        packageId,
        documentId,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentPackage(workspaceSlug, projectId, packageId),
      });
    },
  });
}

export function useUpdateFinding(workspaceSlug: string, projectId: string, packageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, payload }: { findingId: string; payload: IUpdateFindingPayload }) =>
      packageImportService.updateFinding(
        workspaceSlug,
        projectId,
        packageId,
        findingId,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.packageFindings(workspaceSlug, projectId, packageId),
      });
    },
  });
}

export function useImportPlan(workspaceSlug: string, projectId: string, packageId: string | null) {
  return useQuery({
    queryKey: queryKeys.importPlan(workspaceSlug, projectId, packageId ?? ""),
    queryFn: () => packageImportService.getPlan(workspaceSlug, projectId, packageId!),
    enabled: Boolean(packageId),
    // A plan only exists once proposed; a 404 is a state, not a failure to retry.
    retry: false,
  });
}

export function useBuildImportPlan(workspaceSlug: string, projectId: string, packageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: string) =>
      packageImportService.buildPlan(workspaceSlug, projectId, packageId, strategy),
    onSuccess: (plan) => {
      queryClient.setQueryData(queryKeys.importPlan(workspaceSlug, projectId, packageId), plan);
    },
  });
}

export function useDecideImportChanges(
  workspaceSlug: string,
  projectId: string,
  packageId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ decision, changeIds }: { decision: string; changeIds?: string[] }) =>
      packageImportService.decideChanges(
        workspaceSlug,
        projectId,
        packageId,
        decision,
        changeIds,
      ),
    onSuccess: (plan) => {
      queryClient.setQueryData(queryKeys.importPlan(workspaceSlug, projectId, packageId), plan);
    },
  });
}

export function useApplyImport(workspaceSlug: string, projectId: string, packageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => packageImportService.applyPlan(workspaceSlug, projectId, packageId),
    onSuccess: () => {
      // Applying creates real work items, so anything showing project contents is stale.
      queryClient.invalidateQueries({
        queryKey: queryKeys.importPlan(workspaceSlug, projectId, packageId),
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "projects", projectId] });
    },
  });
}

export function useRollbackImport(workspaceSlug: string, projectId: string, packageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => packageImportService.rollbackPlan(workspaceSlug, projectId, packageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.importPlan(workspaceSlug, projectId, packageId),
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "projects", projectId] });
    },
  });
}
