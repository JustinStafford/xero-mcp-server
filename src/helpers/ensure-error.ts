import { formatError } from "./format-error.js";

/**
 * Coerce a thrown value into an Error.
 *
 * Never stringify non-Error values — the xero-node SDK rejects with plain
 * objects (or JSON strings) that carry the request headers, including the
 * Bearer token. Delegate to formatError, which whitelists safe fields.
 */
export function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;

  return new Error(formatError(value));
}
