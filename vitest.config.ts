import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Set here so tests never depend on a developer's .env. Most tests cover
    // every attachment route; attachment-access.test.ts turns them back off.
    env: {
      XERO_CLIENT_ID: "test",
      XERO_CLIENT_SECRET: "test",
      XERO_AUTH_MODE: "",
      XERO_LOCAL_FILES: "1",
      XERO_FILE_URLS: "1",
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Test doubles and barrel files are scaffolding, not code under test.
      exclude: ["src/test-support/**", "src/**/*.test.ts"],
      reporter: ["text", "text-summary"],
    },
  },
});
