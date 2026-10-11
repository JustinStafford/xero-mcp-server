import { z } from "zod";

import { listXeroBudgetSummary } from "../../handlers/list-xero-budget-summary.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListBudgetSummaryTool = CreateXeroTool(
  "list-budget-summary",
  "Retrieve the Budget Summary report: budgeted totals by account across a run \
of periods. This is the organisation's overall budget position — for the lines \
of one named budget, use list-budgets then get-budget.",
  {
    date: z
      .string()
      .optional()
      .describe(
        "Optional end date of the last period, in YYYY-MM-DD format. Defaults to the end of the current month.",
      ),
    periods: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("Optional number of periods to report, 1 to 12. Defaults to 1."),
    timeframe: z
      .union([z.literal(1), z.literal(3), z.literal(12)])
      .optional()
      .describe(
        "Optional period length: 1 = month, 3 = quarter, 12 = year. Defaults to 1 (monthly).",
      ),
  },
  async ({ date, periods, timeframe }) => {
    const response = await listXeroBudgetSummary(date, periods, timeframe);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing budget summary: ${response.error}`,
          },
        ],
      };
    }

    const report = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Report Name: ${report.reportName || "Not specified"}`,
        },
        {
          type: "text" as const,
          text: `Report Date: ${report.reportDate || "Not specified"}`,
        },
        {
          type: "text" as const,
          text: JSON.stringify(report.rows, null, 2),
        },
      ],
    };
  },
);

export default ListBudgetSummaryTool;
