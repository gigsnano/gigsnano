import { beforeEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "./command-palette.store";

describe("command-palette store", () => {
  beforeEach(() => useCommandPaletteStore.getState().reset());
  it("openCreate sets target and closes the palette page", () => {
    useCommandPaletteStore.getState().openCreate("page");
    const s = useCommandPaletteStore.getState();
    expect(s.createTarget).toBe("page");
    expect(s.open).toBe(false);
  });
  it("toggle flips open", () => {
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });
});
