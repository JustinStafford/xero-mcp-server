import { Budget } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Get one budget, including its account lines and per-period amounts.
 */
export async function getXeroBudget(
  budgetId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<XeroClientResponse<Budget>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.accountingApi.getBudget(
      xeroClient.tenantId,
      budgetId,
      // The SDK takes dateTo before dateFrom. Passing them in the obvious
      // order silently inverts the period filter.
      dateTo,
      dateFrom,
      getClientHeaders(),
    );

    const budget = response.body.budgets?.[0];

    if (!budget) {
      throw new Error(`Budget ${budgetId} was not found.`);
    }

    return {
      result: budget,
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
