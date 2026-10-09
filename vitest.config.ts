import { defineConfig } from "vitest/config";

// Scoring-engine tests only; the app's node:test suites in tests/ run via `node --test`.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
