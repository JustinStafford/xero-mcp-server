import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AuPayslip } from "../types/payroll-au-types.js";
import { XeroClientResponse } from "../types/tool-response.js";

async function getPayslip(payslipID: string): Promise<AuPayslip | undefined> {
  await xeroClient.authenticate();

  const response = await xeroClient.payrollAUApi.getPayslip(
    xeroClient.tenantId,
    payslipID,
    getClientHeaders(),
  );

  return response.body.payslip;
}

/**
 * Get a single Australian payslip in full: earnings, deductions, tax and
 * superannuation lines, plus the wage/tax/net totals.
 */
export async function getXeroPayrollPayslip(
  payslipID: string,
): Promise<XeroClientResponse<AuPayslip>> {
  try {
    const payslip = await getPayslip(payslipID);

    if (!payslip) {
      throw new Error(`Payslip ${payslipID} was not found.`);
    }

    return {
      result: payslip,
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
