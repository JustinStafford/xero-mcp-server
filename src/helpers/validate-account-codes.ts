import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

/**
 * Guard against org-scoped identifiers crossing an organisation boundary.
 *
 * Account codes are specific to one organisation's chart of accounts. When
 * data is read from one entity and written into another — a gross-up journal
 * derived from another organisation's payroll, say — a code carried over from
 * the source may not exist in the destination, or worse, may exist and mean
 * something entirely different. The second case posts real money to the wrong
 * account and reports success.
 *
 * Checking the codes against the destination organisation before the write
 * turns that silent mis-posting into a clear error.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { codes: Set<string>; fetchedAt: number }>();

/**
 * Drop the cached chart for an organisation.
 *
 * Must be called after creating or editing an account: otherwise a code that
 * was just created is absent from the cache and the guard rejects the very
 * next journal that uses it, for up to the cache lifetime.
 *
 * Defaults to the organisation of the current call.
 */
export const invalidateAccountCodes = (tenantId?: string): void => {
  cache.delete(tenantId ?? xeroClient.tenantId);
};

const getAccountCodes = async (): Promise<Set<string>> => {
  const tenantId = xeroClient.tenantId;

  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.codes;
  }

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getAccounts(
    tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    getClientHeaders(),
  );

  const codes = new Set(
    (response.body.accounts ?? [])
      .map((account) => account.code)
      .filter((code): code is string => Boolean(code)),
  );

  cache.set(tenantId, { codes, fetchedAt: Date.now() });
  return codes;
};

/**
 * Collect every `accountCode` in a tool's arguments, at any depth.
 *
 * Account codes appear in different shapes across tools — a journal has
 * `manualJournalLines[].accountCode`, an item has `salesDetails.accountCode`,
 * an invoice has `lineItems[].accountCode`. Walking the arguments generically
 * means the guard covers every current write tool, and any future one, without
 * each tool having to opt in.
 */
export const collectAccountCodes = (value: unknown, depth = 0): string[] => {
  // Tool arguments are shallow; the bound just stops pathological input.
  if (depth > 6 || value === null || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectAccountCodes(entry, depth + 1));
  }

  const codes: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "accountCode" && typeof entry === "string" && entry.trim()) {
      codes.push(entry.trim());
    } else {
      codes.push(...collectAccountCodes(entry, depth + 1));
    }
  }
  return codes;
};

/**
 * Returns an error message if any code is absent from the current
 * organisation's chart of accounts, or null when all codes are valid.
 *
 * Reported rather than thrown so the caller can surface it as a normal tool
 * error without the write ever being attempted.
 */
export const validateAccountCodes = async (
  codes: Array<string | undefined>,
): Promise<string | null> => {
  const provided = [...new Set(codes.filter((code): code is string => Boolean(code)))];
  if (provided.length === 0) return null;

  let valid: Set<string>;
  try {
    valid = await getAccountCodes();
  } catch {
    // A failed lookup must not block the write — Xero validates codes too.
    // The guard is a safety net, not the only line of defence.
    return null;
  }

  // An organisation with no coded accounts tells us nothing; do not block.
  if (valid.size === 0) return null;

  const unknown = provided.filter((code) => !valid.has(code));
  if (unknown.length === 0) return null;

  return (
    `Account code${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")} ` +
    `do${unknown.length === 1 ? "es" : ""} not exist in this organisation's chart of accounts. ` +
    "Account codes are organisation-specific — a code from another organisation cannot be reused here. " +
    "Call list-accounts for this organisation to find the correct codes."
  );
};
