import { z } from "zod";

import { getXeroPayrollPayRun } from "../../handlers/get-xero-payroll-pay-run.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const GetPayrollPayRunTool = CreateXeroTool(
  "get-payroll-pay-run",
  "Get a single Australian pay run, including a summary of every payslip in it. \
Use the payslip IDs returned here with get-payroll-payslip to obtain the earnings, \
tax and superannuation detail needed to build a journal.",
  {
    payRunID: z.string().describe("The Xero identifier of the pay run"),
  },
  async ({ payRunID }) => {
    const response = await getXeroPayrollPayRun(payRunID);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching pay run: ${response.error}`,
          },
        ],
      };
    }

    const payRun = response.result;
    const payslips = payRun.payslips ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Pay run ${payRun.payRunID}`,
            `Period: ${formatXeroDate(payRun.payRunPeriodStartDate)} to ${formatXeroDate(payRun.payRunPeriodEndDate)}`,
            `Payment date: ${formatXeroDate(payRun.paymentDate) ?? "unknown"}`,
            `Status: ${payRun.payRunStatus ?? "unknown"}`,
            payRun.wages !== undefined ? `Wages: ${payRun.wages}` : null,
            payRun.deductions !== undefined ? `Deductions: ${payRun.deductions}` : null,
            payRun.tax !== undefined ? `Tax: ${payRun.tax}` : null,
            payRun._super !== undefined ? `Super: ${payRun._super}` : null,
            payRun.reimbursement !== undefined
              ? `Reimbursements: ${payRun.reimbursement}`
              : null,
            payRun.netPay !== undefined ? `Net pay: ${payRun.netPay}` : null,
            "",
            `Payslips (${payslips.length}):`,
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
        ...payslips.map((payslip) => ({
          type: "text" as const,
          text: [
            `${payslip.firstName ?? ""} ${payslip.lastName ?? ""}`.trim(),
            `  Payslip ID: ${payslip.payslipID}`,
            `  Employee ID: ${payslip.employeeID}`,
            payslip.wages !== undefined ? `  Wages: ${payslip.wages}` : null,
            payslip.tax !== undefined ? `  Tax: ${payslip.tax}` : null,
            payslip._super !== undefined ? `  Super: ${payslip._super}` : null,
            payslip.netPay !== undefined ? `  Net pay: ${payslip.netPay}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default GetPayrollPayRunTool;
