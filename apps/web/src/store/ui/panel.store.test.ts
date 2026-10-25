// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "./panel.store";

const setPhone = (phone: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone, media: query }));

describe("panel store show/hide", () => {
  beforeEach(() => usePanelStore.setState({ collapsed: false, mobileOpenAt: null }));
  afterEach(() => vi.unstubAllGlobals());

  it("on phones, opens the drawer for the current route and never touches collapsed", () => {
    setPhone(true);
    usePanelStore.getState().showPanel("/acme/projects");
    expect(usePanelStore.getState()).toMatchObject({ mobileOpenAt: "/acme/projects", collapsed: false });
    usePanelStore.getState().hidePanel();
    expect(usePanelStore.getState()).toMatchObject({ mobileOpenAt: null, collapsed: false });
  });

  it("above md, toggles the persisted collapsed column and leaves the drawer closed", () => {
    setPhone(false);
    usePanelStore.getState().hidePanel();
    expect(usePanelStore.getState()).toMatchObject({ mobileOpenAt: null, collapsed: true });
    usePanelStore.getState().showPanel("/acme");
    expect(usePanelStore.getState()).toMatchObject({ mobileOpenAt: null, collapsed: false });
  });

  it("never persists the drawer state", () => {
    setPhone(true);
    usePanelStore.getState().showPanel("/acme");
    const saved = JSON.parse(localStorage.getItem("gn.panel") ?? "{}");
    expect(saved.state).not.toHaveProperty("mobileOpenAt");
  });
});
