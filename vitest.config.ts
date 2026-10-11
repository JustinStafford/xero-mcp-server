import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Test doubles and barrel files are scaffolding, not code under test.
      exclude: ["src/test-support/**", "src/**/*.test.ts"],
      reporter: ["text", "text-summary"],
    },
  },
});
