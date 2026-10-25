import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@gigsnano/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Force mocks OFF for unit tests so `shouldUseMock` exercises the real-vs-mock
    // routing. `USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false"`, so if
    // this is unset the const is `true` and every path would route to mock —
    // making the "covered → real" assertions fail. vitest injects `env` into
    // process.env BEFORE test modules import, so the module-level const is correct.
    env: { NEXT_PUBLIC_USE_MOCKS: "false" },
  },
});
