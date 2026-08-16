import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AuEmployee } from "../types/payroll-au-types.js";
import { XeroClientResponse } from "../types/tool-response.js";

async function getEmployees(page: number): Promise<AuEmployee[]> {
  await xeroClient.authenticate();

  const employees = await xeroClient.payrollAUApi.getEmployees(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    page,
    getClientHeaders(),
  );

  return employees.body.employees ?? [];
}

/**
 * List employees from Australian payroll.
 */
export async function listXeroPayrollAuEmployees(
  page: number = 1,
): Promise<XeroClientResponse<AuEmployee[]>> {
  try {
    const employees = await getEmployees(page);

    return {
      result: employees,
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
