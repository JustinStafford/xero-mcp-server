import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CREDENTIAL_VARS = [
  "XERO_CLIENT_ID",
  "XERO_CLIENT_SECRET",
  "XERO_CLIENT_BEARER_TOKEN",
  "XERO_AUTH_MODE",
] as const;

describe("xero-client", () => {
  beforeEach(() => {
    vi.resetModules();
    // Empty rather than deleted: the module calls `dotenv.config()`, which
    // leaves already-present keys alone. A developer's local `.env` therefore
    // cannot leak real credentials into these tests.
    for (const name of CREDENTIAL_VARS) {
      vi.stubEnv(name, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("imports without Xero credentials set", async () => {
    await expect(import("../xero-client.js")).resolves.toHaveProperty(
      "xeroClient",
    );
  });

  it("throws only when the client is actually used", async () => {
    const { getXeroClient } = await import("../xero-client.js");

    expect(() => getXeroClient()).toThrow(/Environment Variables not set/);
  });

  it("builds a client once credentials are present", async () => {
    vi.stubEnv("XERO_CLIENT_ID", "test-client-id");
    vi.stubEnv("XERO_CLIENT_SECRET", "test-client-secret");

    const { getXeroClient } = await import("../xero-client.js");

    expect(getXeroClient()).toBe(getXeroClient());
  });

  it("reaches the real client through the lazy proxy", async () => {
    vi.stubEnv("XERO_CLIENT_ID", "test-client-id");
    vi.stubEnv("XERO_CLIENT_SECRET", "test-client-secret");

    const { getXeroClient, xeroClient } = await import("../xero-client.js");

    xeroClient.tenantId = "tenant-123";

    expect(getXeroClient().tenantId).toBe("tenant-123");
    expect(xeroClient.accountingApi).toBeDefined();
  });
});
