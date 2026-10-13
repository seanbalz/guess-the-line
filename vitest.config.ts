import { defineConfig } from "vitest/config";

// Scoring-engine tests (test/**/*.test.ts) plus the trends panel render test (tests/**/*.test.jsx).
// The app's node:test suites in tests/*.test.mjs run via `node --test`.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: ["test/**/*.test.ts", "tests/**/*.test.jsx"] },
});
