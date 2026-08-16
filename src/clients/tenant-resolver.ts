import { xeroClient } from "./xero-client.js";

/**
 * Resolves a human-supplied organisation name to a Xero tenant ID.
 *
 * Tools take organisation *names* rather than tenant IDs so that GUIDs never
 * have to be produced from memory — a transposed character would otherwise
 * silently target the wrong entity.
 */

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { tenants: XeroTenant[]; fetchedAt: number } | null = null;
let inFlight: Promise<XeroTenant[]> | null = null;

/** Connected organisations, cached briefly to avoid a lookup per tool call. */
export const listTenants = async (
  forceRefresh = false,
): Promise<XeroTenant[]> => {
  if (
    !forceRefresh &&
    cache &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache.tenants;
  }

  if (!inFlight) {
    inFlight = (async () => {
      await xeroClient.authenticate();

      // fullOrgDetails=false: a single GET /connections rather than an extra
      // getOrganisations call per tenant.
      const connections = await xeroClient.updateTenants(false);

      const tenants: XeroTenant[] = (connections ?? []).map((connection) => ({
        tenantId: connection.tenantId,
        tenantName: connection.tenantName,
        tenantType: connection.tenantType,
      }));

      cache = { tenants, fetchedAt: Date.now() };
      return tenants;
    })().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
};

interface MatchResult {
  tenant?: XeroTenant;
  candidates?: XeroTenant[];
}

const matchTenant = (tenants: XeroTenant[], query: string): MatchResult => {
  const needle = query.toLowerCase();

  const byId = tenants.find((t) => t.tenantId.toLowerCase() === needle);
  if (byId) return { tenant: byId };

  const exact = tenants.filter((t) => t.tenantName?.toLowerCase() === needle);
  if (exact.length === 1) return { tenant: exact[0] };
  if (exact.length > 1) return { candidates: exact };

  const partial = tenants.filter((t) =>
    t.tenantName?.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return { tenant: partial[0] };
  if (partial.length > 1) return { candidates: partial };

  return {};
};

/**
 * Resolve an organisation name or tenant ID to a connected tenant.
 *
 * Ambiguity is an error rather than a best guess: picking one of two matching
 * organisations would post real transactions to the wrong entity.
 */
export const resolveTenant = async (input: string): Promise<XeroTenant> => {
  const query = (input ?? "").trim();

  if (!query) {
    throw new Error(
      "No organisation specified. Call list-tenants to see the available organisations, " +
        "then pass one as the `organisation` argument.",
    );
  }

  let tenants = await listTenants();
  let match = matchTenant(tenants, query);

  // An organisation connected since the cache was warmed would otherwise look
  // missing, so miss once, refresh, and try again before reporting failure.
  if (!match.tenant && !match.candidates) {
    tenants = await listTenants(true);
    match = matchTenant(tenants, query);
  }

  if (match.candidates) {
    throw new Error(
      `"${query}" matches more than one organisation: ` +
        `${match.candidates.map((t) => t.tenantName).join(", ")}. ` +
        "Use the full organisation name.",
    );
  }

  if (!match.tenant) {
    throw new Error(
      `No connected organisation matches "${query}". ` +
        `Available organisations: ${tenants.map((t) => t.tenantName).join(", ") || "none"}. ` +
        "If an organisation is missing, authorise it with `npm run authorise`.",
    );
  }

  return match.tenant;
};
