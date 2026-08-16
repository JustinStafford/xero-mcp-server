import { XeroTenant, listTenants } from "../clients/tenant-resolver.js";
import { formatError } from "../helpers/format-error.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * List every Xero organisation the current authorisation can reach.
 *
 * Unlike the other handlers this is not organisation-scoped — it is the
 * lookup that makes the `organisation` argument on every other tool usable.
 */
export async function listXeroTenants(
  refresh: boolean = false,
): Promise<XeroClientResponse<XeroTenant[]>> {
  try {
    const tenants = await listTenants(refresh);

    return {
      result: tenants,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
