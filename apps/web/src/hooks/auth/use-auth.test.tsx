// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IAuthUser } from "@/types";

const signIn = vi.fn();
vi.mock("@/services/auth/auth.service", () => ({
  authService: {
    signIn: (payload: unknown) => signIn(payload),
  },
}));
vi.mock("@/services/auth/refresh", () => ({ resetRefreshBackoff: vi.fn() }));
vi.mock("@/lib/auth/fetch-auth-me", () => ({ fetchAuthMe: vi.fn() }));
vi.mock("@/services/workspace/workspace.service", () => ({ workspaceService: {} }));

import { queryKeys } from "../query-keys";
import { useSignIn } from "./use-auth";

const bob: IAuthUser = {
  id: "u2",
  display_name: "Bob",
  email: "bob@example.test",
  avatar_url: null,
  last_workspace_slug: "beta",
  email_digest: true,
  product_updates: true,
  email_verified: true,
} as IAuthUser;

describe("useSignIn", () => {
  /**
   * Signing in can replace a *live* session rather than start from empty — that
   * is what "switch account" does, and the endpoint just overwrites the cookies.
   * Anything the previous account cached has to go with it.
   */
  it("drops the previous account's cached data and seeds the new user", async () => {
    signIn.mockResolvedValue(bob);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Account A's session, plus data only A could see.
    queryClient.setQueryData(queryKeys.authMe, { id: "u1", display_name: "Ada" });
    queryClient.setQueryData(queryKeys.workspaces, [{ slug: "acme" }]);
    queryClient.setQueryData(queryKeys.projects("acme"), [{ id: "p1", name: "Secret" }]);

    const { result } = renderHook(() => useSignIn(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.mutateAsync({ email: "bob@example.test", password: "pw" });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.authMe)).toEqual(bob);
    });
    // A's workspaces and projects must not survive into B's session.
    expect(queryClient.getQueryData(queryKeys.workspaces)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.projects("acme"))).toBeUndefined();
  });
});
