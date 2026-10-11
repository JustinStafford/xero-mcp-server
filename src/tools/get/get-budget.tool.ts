import { z } from "zod";

import { getXeroBudget } from "../../handlers/get-xero-budget.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const GetBudgetTool = CreateXeroTool(
  "get-budget",
  "Get one budget in full: every account line with its budgeted amount for each \
period. Use list-budgets to find the budget ID, and list-accounts to turn an \
account code into an account name. Pair this with list-profit-and-loss for \
budget-versus-actual analysis. Budgets cannot be created or edited through the \
Xero API — that is a Xero UI task (Business → Budget manager).",
  {
    budgetId: z.string().describe("The Xero identifier of the budget"),
    dateFrom: z
      .string()
      .optional()
      .describe("Optional earliest period to return, in YYYY-MM-DD format"),
    dateTo: z
      .string()
      .optional()
      .describe("Optional latest period to return, in YYYY-MM-DD format"),
  },
  async ({ budgetId, dateFrom, dateTo }) => {
    const response = await getXeroBudget(budgetId, dateFrom, dateTo);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching budget: ${response.error}`,
          },
        ],
      };
    }

    const budget = response.result;
    const lines = budget.budgetLines ?? [];

    return {
      content: [
        {
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
        },
        ...(lines.length === 0
          ? [
              {
                type: "text" as const,
                text: "This budget has no account lines for the requested periods.",
              },
            ]
          : lines.map((line) => {
              const balances = line.budgetBalances ?? [];
              // Periods share an account, so a total across them is meaningful.
              // A total across accounts is not — revenue and expense lines
              // would cancel out — so none is reported.
              // Rounded because summing decimals in binary floating point
              // otherwise reports a budget total as 12000.000000000002.
              const total =
                Math.round(
                  balances.reduce(
                    (sum, balance) => sum + (balance.amount ?? 0),
                    0,
                  ) * 100,
                ) / 100;

              return {
                type: "text" as const,
                text: [
                  `Account ${line.accountCode || "no code"}`,
                  `  Account ID: ${line.accountID || "unknown"}`,
                  ...balances.map((balance) =>
                    [
                      `  ${balance.period ?? "unknown period"}: ${balance.amount ?? 0}`,
                      // Xero's own spec labels these inconsistently, so the
                      // second figure is only shown when it says something new.
                      balance.unitAmount !== undefined &&
                      balance.unitAmount !== balance.amount
                        ? ` (unit amount ${balance.unitAmount})`
                        : "",
                      balance.notes ? ` — ${balance.notes}` : "",
                    ].join(""),
                  ),
                  balances.length > 0 ? `  Total: ${total}` : null,
                ]
                  .filter((text) => text !== null)
                  .join("\n"),
              };
            })),
      ],
    };
  },
);

export default GetBudgetTool;
