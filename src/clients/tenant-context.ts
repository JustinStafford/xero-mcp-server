import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-call organisation context.
 *
 * The Xero client is a process-wide singleton with a single `tenantId`, and
 * every handler reads it. Assigning that field before dispatch would work for
 * one call at a time, but tool calls run concurrently — a request that reads
 * from one organisation while writing to another would interleave, and the
 * second assignment would silently redirect the first call's writes to the
 * wrong organisation.
 *
 * Holding the tenant in AsyncLocalStorage scopes it to a single call's async
 * tree instead, so concurrent calls cannot observe each other's target.
 * `MCPXeroClient.tenantId` reads from here, which is why the ~50 handlers
 * need no changes.
 */
export interface TenantContext {
  tenantId: string;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();
