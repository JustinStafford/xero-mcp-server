import { ReportWithRow } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Budget Summary report: budgeted totals by account across a set of periods.
 *
 * @param date End date of the last period, YYYY-MM-DD
 * @param periods Number of periods to report, 1-12
 * @param timeframe Period length: 1 = month, 3 = quarter, 12 = year
 */
export async function listXeroBudgetSummary(
  date?: string,
  periods?: number,
  timeframe?: number,
): Promise<XeroClientResponse<ReportWithRow>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.accountingApi.getReportBudgetSummary(
      xeroClient.tenantId,
      date,
      periods,
      timeframe,
      getClientHeaders(),
    );

    const report = response.body.reports?.[0];

    if (!report) {
      return {
        result: null,
        isError: true,
        error: "Failed to fetch the budget summary report from Xero.",
      };
    }

    return {
      result: report,
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
