import { Budget } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * List the budgets in an organisation.
 *
 * Metadata only: Xero returns no budget lines from this call whatever the date
 * filter, so the per-period amounts have to come from getXeroBudget.
 */
export async function listXeroBudgets(
  dateFrom?: string,
  dateTo?: string,
): Promise<XeroClientResponse<Budget[]>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.accountingApi.getBudgets(
      xeroClient.tenantId,
      undefined, // iDs — a single budget is served by get-budget
      // The SDK takes dateTo before dateFrom. Passing them in the obvious
      // order silently inverts the period filter.
      dateTo,
      dateFrom,
      getClientHeaders(),
    );

    return {
      result: response.body.budgets ?? [],
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
