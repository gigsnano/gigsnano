// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IAuthUser } from "@/types";

let user: IAuthUser | null = null;
let state = { isPending: false, isError: false };
let params = new URLSearchParams();
let pathname = "/sign-in";
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
  usePathname: () => pathname,
}));
vi.mock("@/hooks/auth/use-auth", () => ({
  useAuthUser: () => ({ data: user, ...state }),
}));

import { GuestGuard } from "./guest-guard";

const signedIn = (over: Partial<IAuthUser> = {}): IAuthUser =>
  ({
    id: "u1",
    display_name: "Ada Lovelace",
    email: "ada@example.test",
    avatar_url: null,
    last_workspace_slug: "acme",
    email_digest: true,
    product_updates: true,
    email_verified: true,
    ...over,
  }) as IAuthUser;

afterEach(() => {
  cleanup();
  replace.mockClear();
  user = null;
  state = { isPending: false, isError: false };
  params = new URLSearchParams();
  pathname = "/sign-in";
});

describe("GuestGuard", () => {
  it("shows the auth page to a signed-out visitor", () => {
    render(<GuestGuard>sign in here</GuestGuard>);
    expect(screen.getByText("sign in here")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("bounces a signed-in user to their workspace", () => {
    user = signedIn();
    render(<GuestGuard>sign in here</GuestGuard>);
    expect(replace).toHaveBeenCalledWith("/acme");
    expect(screen.queryByText("sign in here")).not.toBeInTheDocument();
  });

  it("sends a signed-in user with no workspace to onboarding", () => {
    user = signedIn({ last_workspace_slug: null });
    render(<GuestGuard>sign in here</GuestGuard>);
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });

  // Without this a signed-in user cannot reach /sign-in at all, which strands
  // anyone holding an invitation addressed to a different email.
  it("lets a signed-in user through when they asked to switch account", () => {
    user = signedIn();
    params = new URLSearchParams("switch=1");
    render(<GuestGuard>sign in here</GuestGuard>);
    expect(screen.getByText("sign in here")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("still honours ?next= when it is not a switch", () => {
    user = signedIn();
    params = new URLSearchParams("next=/acme/projects");
    render(<GuestGuard>sign in here</GuestGuard>);
    expect(replace).toHaveBeenCalledWith("/acme/projects");
  });

  // The regression this guard caused: signing up from an invite link landed the
  // new account back on /invitations/<token>, which bounced them to /onboarding
  // and offered to create the workspace they had just been invited to.
  it("lets a signed-in user reach an invitation page", () => {
    user = signedIn({ last_workspace_slug: null });
    pathname = "/invitations/tok-123";
    render(<GuestGuard>accept invitation</GuestGuard>);
    expect(screen.getByText("accept invitation")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders nothing while the session is still loading", () => {
    state = { isPending: true, isError: false };
    const { container } = render(<GuestGuard>sign in here</GuestGuard>);
    expect(container).toBeEmptyDOMElement();
  });
});
