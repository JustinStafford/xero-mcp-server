import { z } from "zod";

import { listXeroPayrollPayRuns } from "../../handlers/list-xero-payroll-pay-runs.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const ListPayrollPayRunsTool = CreateXeroTool(
  "list-payroll-pay-runs",
  "List Australian payroll pay runs for an organisation, most recent first. \
Use this to find the pay run covering a period, then get-payroll-pay-run to see its payslips.",
  {
    page: z
      .number()
      .optional()
      .describe("Optional page number for paging through pay runs, defaults to 1"),
  },
  async ({ page }) => {
    const response = await listXeroPayrollPayRuns(page ?? 1);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing pay runs: ${response.error}`,
          },
        ],
      };
    }

    const payRuns = response.result ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${payRuns.length} pay run${payRuns.length === 1 ? "" : "s"}:`,
        },
        ...payRuns.map((payRun) => ({
          type: "text" as const,
          text: [
            `Pay run: ${formatXeroDate(payRun.payRunPeriodStartDate)} to ${formatXeroDate(payRun.payRunPeriodEndDate)}`,
            `  ID: ${payRun.payRunID}`,
            `  Payment date: ${formatXeroDate(payRun.paymentDate) ?? "unknown"}`,
            `  Status: ${payRun.payRunStatus ?? "unknown"}`,
            payRun.wages !== undefined ? `  Wages: ${payRun.wages}` : null,
            payRun.tax !== undefined ? `  Tax: ${payRun.tax}` : null,
            payRun._super !== undefined ? `  Super: ${payRun._super}` : null,
            payRun.netPay !== undefined ? `  Net pay: ${payRun.netPay}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListPayrollPayRunsTool;
