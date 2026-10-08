import { z } from "zod";

import { listXeroBudgets } from "../../handlers/list-xero-budgets.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListBudgetsTool = CreateXeroTool(
  "list-budgets",
  "List the budgets in an organisation. Returns budget names and IDs only — Xero \
sends no budget lines with this call, so call get-budget with an ID for the \
per-account, per-period amounts. OVERALL budgets cover the whole organisation; \
TRACKING budgets are scoped to a tracking category option. Budgets cannot be \
created or edited through the Xero API — that is a Xero UI task (Business → \
Budget manager).",
  {
    dateFrom: z
      .string()
      .optional()
      .describe("Optional earliest budget period in YYYY-MM-DD format"),
    dateTo: z
      .string()
      .optional()
      .describe("Optional latest budget period in YYYY-MM-DD format"),
  },
  async ({ dateFrom, dateTo }) => {
    const response = await listXeroBudgets(dateFrom, dateTo);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing budgets: ${response.error}`,
          },
        ],
      };
    }

    const budgets = response.result;

    if (budgets.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No budgets in this organisation.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${budgets.length} budget${budgets.length === 1 ? "" : "s"}:`,
        },
        ...budgets.map((budget) => ({
          type: "text" as const,
          text: [
            `${budget.description || "Unnamed budget"}${
              budget.type ? ` (${budget.type})` : ""
            }`,
            `  Budget ID: ${budget.budgetID}`,
            budget.updatedDateUTC
              ? `  Last updated: ${budget.updatedDateUTC.toISOString()}`
              : null,
            ...(budget.tracking ?? []).map(
              (category) =>
                `  Tracking: ${category.name ?? "Unnamed category"}${
                  category.option ? ` = ${category.option}` : ""
                }`,
            ),
          ]
            .filter((line) => line !== null)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListBudgetsTool;
