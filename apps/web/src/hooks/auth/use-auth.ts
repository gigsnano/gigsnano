import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { fetchAuthMe } from "@/lib/auth/fetch-auth-me";
import { authService } from "@/services/auth/auth.service";
import { resetRefreshBackoff } from "@/services/auth/refresh";
import { workspaceService } from "@/services/workspace/workspace.service";
import type {
  IAuthUser,
  IChangePasswordPayload,
  IResetPasswordPayload,
  IUpdateAccountPayload,
  IWorkspaceHoliday,
} from "@/types";

import { queryKeys } from "../query-keys";

/**
 * Seed the new session and drop everything the previous one cached.
 *
 * Signing in can *replace* a live session rather than start from empty — that
 * is what "switch account" does, and the sign-in endpoint simply overwrites the
 * cookies. Without this, account A's cached projects, work items and members
 * stay in the client cache and render under account B until each query happens
 * to refetch. Keyed on the "auth" prefix so the freshly-seeded user survives.
 */
function seedSession(queryClient: QueryClient, user: IAuthUser) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  queryClient.setQueryData(queryKeys.authMe, user);
}

export function useAuthUser() {
  return useQuery({
    queryKey: queryKeys.authMe,
    queryFn: () => fetchAuthMe(() => authService.getMe()),
    retry: false,
    // Session is cookie-backed; revalidate periodically but don't thrash on remount.
    staleTime: 60_000,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof authService.signIn>[0]) =>
      authService.signIn(payload),
    onSuccess: (user) => {
      // Seed from the sign-in response so AuthGuard doesn't bounce while /auth/me refetches.
      seedSession(queryClient, user);
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof authService.signUp>[0]) =>
      authService.signUp(payload),
    onSuccess: (user) => {
      resetRefreshBackoff();
      seedSession(queryClient, user);
    },
  });
}

export function useGoogleSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof authService.signInWithGoogle>[0]) =>
      authService.signInWithGoogle(payload),
    onSuccess: (user) => {
      resetRefreshBackoff();
      seedSession(queryClient, user);
    },
  });
}

/** Mints a single-use code for the mobile app. Never seeds or touches the web session. */
export function useMobileHandoff() {
  return useMutation({
    mutationFn: (payload: Parameters<typeof authService.createMobileHandoff>[0]) =>
      authService.createMobileHandoff(payload),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.signOut(),
    onSuccess: () => {
      // Seed /auth/me as null so the auth guards flip to "signed out" on this
      // render, and drop every non-auth query so the previous session's data
      // can't leak to the next user. We deliberately do NOT invalidate/refetch
      // /auth/me here: a refetch races the server clearing the session cookie
      // and can momentarily resurrect the session, bouncing the user between the
      // app and /sign-in.
      queryClient.setQueryData(queryKeys.authMe, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    },
  });
}

export function useForgotPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => authService.forgotPassword(email),
    onSuccess: () => {
      // Email-only flow; no cached data changes — satisfies mutation invalidation lint.
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateAccountPayload) => authService.updateAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IChangePasswordPayload) => authService.changePassword(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IResetPasswordPayload) => authService.resetPassword(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useRequestVerifyEmail() {
  return useMutation({
    mutationFn: () => authService.requestVerifyEmail(),
  });
}

export function useConfirmVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => authService.confirmVerifyEmail(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => authService.acceptInvitation(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingInvites });
      // The membership is what just changed: without this the workspace list a
      // brand-new invitee already fetched (empty) stays empty, so the sidebar and
      // /onboarding still believe they belong nowhere.
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof authService.createWorkspace>[0]) =>
      authService.createWorkspace(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => workspaceService.getWorkspaces(),
  });
}

export function useWorkspace(slug: string) {
  return useQuery({
    queryKey: queryKeys.workspace(slug),
    queryFn: () => workspaceService.getWorkspace(slug),
    retry: false,
  });
}

/**
 * The workspace's non-working days, ready to test a `YYYY-MM-DD` against.
 *
 * A Set rather than the raw list because every caller is asking "is this day
 * one?" per point, and a linear scan per point is the wrong shape for a chart
 * redrawing 30 of them.
 */
export function useWorkspaceHolidays(slug: string): ReadonlySet<string> {
  const { data } = useWorkspace(slug);
  return new Set((data?.holidays ?? []).map((h) => h.date));
}

export function useUpdateWorkspace(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name?: string; holidays?: IWorkspaceHoliday[] }) =>
      workspaceService.updateWorkspace(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useGitHubStatus(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.github(workspaceSlug),
    queryFn: () => workspaceService.getGitHubStatus(workspaceSlug),
  });
}

export function useConnectGitHub(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoName?: string) => workspaceService.connectGitHub(workspaceSlug, repoName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.github(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
    },
  });
}

export function useDisconnectGitHub(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => workspaceService.disconnectGitHub(workspaceSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.github(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
    },
  });
}

export function useGitHubRepos(workspaceSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.githubRepos(workspaceSlug),
    queryFn: () => workspaceService.getGitHubRepos(workspaceSlug),
    enabled: Boolean(workspaceSlug) && enabled,
  });
}

export function useGitHubInstallUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => workspaceService.getGitHubInstallUrl(slug),
    onSuccess: (_url, slug) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.github(slug) });
    },
  });
}

export function useCompleteGitHubOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slug: string; code: string; state: string }) =>
      workspaceService.completeGitHubOAuth(vars.slug, vars.code, vars.state),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.github(vars.slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.githubRepos(vars.slug) });
    },
  });
}

export function useRetryClone(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => workspaceService.retryClone(workspaceSlug, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
    },
  });
}

export function useLinkGitHubRepo(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoFullName: string) =>
      workspaceService.linkGitHubRepo(workspaceSlug, projectId, repoFullName),
    onSuccess: () => {
      // The link flips clone_status → PENDING and re-clones: refresh the project
      // (dialog + repository page read it), the file tree, and the projects list.
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceTree(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
    },
  });
}
