import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AuPayRun } from "../types/payroll-au-types.js";
import { XeroClientResponse } from "../types/tool-response.js";

async function getPayRun(payRunID: string): Promise<AuPayRun | undefined> {
  await xeroClient.authenticate();

  const response = await xeroClient.payrollAUApi.getPayRun(
    xeroClient.tenantId,
    payRunID,
    getClientHeaders(),
  );

  return response.body.payRuns?.[0];
}

/**
 * Get a single Australian pay run, including the summary of each payslip it
 * contains. Use the payslip IDs from here with get-payroll-payslip to obtain
 * the earnings, tax and superannuation detail needed for a journal.
 */
export async function getXeroPayrollPayRun(
  payRunID: string,
): Promise<XeroClientResponse<AuPayRun>> {
  try {
    const payRun = await getPayRun(payRunID);

    if (!payRun) {
      throw new Error(`Pay run ${payRunID} was not found.`);
    }

    return {
      result: payRun,
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
