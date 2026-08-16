import { Account } from "xero-node";
import { z } from "zod";

import { updateXeroAccount } from "../../handlers/update-xero-account.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const UpdateAccountTool = CreateXeroTool(
  "update-account",
  "Update a general ledger account in an organisation's chart of accounts. \
Identify the account by its code (preferred) or its account ID. Only the fields you \
supply are changed. An account's type cannot be changed after creation. \
To retire an account, set status to ARCHIVED — archiving is reversible, and Xero only \
permits outright deletion of accounts that have never been used.",
  {
    accountIdOrCode: z
      .string()
      .describe(
        "The account to update, identified by its code (e.g. '200') or its Xero account \
ID. Codes are organisation-specific, so this resolves within the organisation named in \
the organisation argument.",
      ),
    name: z.string().optional().describe("New name for the account"),
    code: z
      .string()
      .optional()
      .describe(
        "New account code. Changing a code affects every report and saved rule that \
references it — confirm before changing.",
      ),
    description: z.string().optional().describe("New description"),
    taxType: z
      .string()
      .optional()
      .describe(
        "New tax type code. Use list-tax-rates for this organisation to find valid values.",
      ),
    status: z
      .enum(["ACTIVE", "ARCHIVED"])
      .optional()
      .describe(
        "Set ARCHIVED to retire an account without deleting it, or ACTIVE to restore \
one. Deletion is deliberately not offered.",
      ),
    enablePaymentsToAccount: z
      .boolean()
      .optional()
      .describe("Whether the account can have payments applied to it"),
    showInExpenseClaims: z
      .boolean()
      .optional()
      .describe("Whether the account is available in expense claims"),
    addToWatchlist: z
      .boolean()
      .optional()
      .describe("Whether to show the account on the Xero dashboard watchlist"),
  },
  async (args) => {
    // Send only what was supplied; an undefined field must not blank an
    // existing value.
    const changes: Account = {};
    if (args.name !== undefined) changes.name = args.name;
    if (args.code !== undefined) changes.code = args.code;
    if (args.description !== undefined) changes.description = args.description;
    if (args.taxType !== undefined) changes.taxType = args.taxType;
    if (args.status !== undefined) {
      changes.status = args.status as unknown as Account.StatusEnum;
    }
    if (args.enablePaymentsToAccount !== undefined) {
      changes.enablePaymentsToAccount = args.enablePaymentsToAccount;
    }
    if (args.showInExpenseClaims !== undefined) {
      changes.showInExpenseClaims = args.showInExpenseClaims;
    }
    if (args.addToWatchlist !== undefined) {
      changes.addToWatchlist = args.addToWatchlist;
    }

    if (Object.keys(changes).length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No changes supplied. Provide at least one field to update.",
          },
        ],
      };
    }

    const response = await updateXeroAccount(args.accountIdOrCode, changes);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating account: ${response.error}`,
          },
        ],
      };
    }

    const updated = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Account updated: ${updated.name}`,
            `  Code: ${updated.code ?? "none"}`,
            `  ID: ${updated.accountID}`,
            `  Type: ${updated.type}`,
            `  Status: ${updated.status}`,
            updated.taxType ? `  Tax Type: ${updated.taxType}` : null,
            updated.description ? `  Description: ${updated.description}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default UpdateAccountTool;
