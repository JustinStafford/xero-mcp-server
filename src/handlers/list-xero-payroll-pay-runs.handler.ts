import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AuPayRun } from "../types/payroll-au-types.js";
import { XeroClientResponse } from "../types/tool-response.js";

async function getPayRuns(page: number): Promise<AuPayRun[]> {
  await xeroClient.authenticate();

  // Australian payroll. The organisation is supplied by the per-call tenant
  // context, so this reads whichever entity the tool call named.
  const payRuns = await xeroClient.payrollAUApi.getPayRuns(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    "PaymentDate DESC", // order
    page,
    getClientHeaders(),
  );

  return payRuns.body.payRuns ?? [];
}

/**
 * List Australian payroll pay runs, most recent first.
 */
export async function listXeroPayrollPayRuns(
  page: number = 1,
): Promise<XeroClientResponse<AuPayRun[]>> {
  try {
    const payRuns = await getPayRuns(page);

    return {
      result: payRuns,
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
