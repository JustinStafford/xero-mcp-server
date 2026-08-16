import { Account, AccountType } from "xero-node";
import { z } from "zod";

import { createXeroAccount } from "../../handlers/create-xero-account.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ACCOUNT_TYPES = [
  "BANK",
  "CURRENT",
  "CURRLIAB",
  "DEPRECIATN",
  "DIRECTCOSTS",
  "EQUITY",
  "EXPENSE",
  "FIXED",
  "INVENTORY",
  "LIABILITY",
  "NONCURRENT",
  "OTHERINCOME",
  "OVERHEADS",
  "PREPAYMENT",
  "REVENUE",
  "SALES",
  "TERMLIAB",
] as const;

const CreateAccountTool = CreateXeroTool(
  "create-account",
  "Create a general ledger account in an organisation's chart of accounts. \
Account codes are specific to one organisation — check the destination organisation's \
existing chart with list-accounts first, both to avoid colliding with a code already in \
use and to match the numbering convention already in place.",
  {
    name: z
      .string()
      .describe("Name of the account, e.g. 'Consulting Income' (max 150 characters)"),
    type: z
      .enum(ACCOUNT_TYPES)
      .describe(
        "Account type. Determines where the account appears in reports and cannot be \
changed after creation, so confirm it before creating.",
      ),
    code: z
      .string()
      .optional()
      .describe(
        "Account code, e.g. '200' (max 10 alphanumeric characters). Required for every \
type except BANK. Must not already exist in this organisation.",
      ),
    description: z
      .string()
      .optional()
      .describe("Optional description. Not valid for BANK accounts."),
    taxType: z
      .string()
      .optional()
      .describe(
        "Optional tax type code, e.g. 'INPUT' or 'OUTPUT'. Tax types are \
organisation-specific — use list-tax-rates for this organisation to find valid values.",
      ),
    bankAccountNumber: z
      .string()
      .optional()
      .describe("Bank account number. Required when type is BANK."),
    bankAccountType: z
      .enum(["BANK", "CREDITCARD", "PAYPAL"])
      .optional()
      .describe("Bank account type. Only valid when type is BANK."),
    currencyCode: z
      .string()
      .optional()
      .describe("Currency code, e.g. 'AUD'. Only valid when type is BANK."),
    enablePaymentsToAccount: z
      .boolean()
      .optional()
      .describe("Whether the account can have payments applied to it. Default false."),
    showInExpenseClaims: z
      .boolean()
      .optional()
      .describe("Whether the account is available in expense claims. Default false."),
    addToWatchlist: z
      .boolean()
      .optional()
      .describe("Whether to show the account on the Xero dashboard watchlist."),
  },
  async (args) => {
    const account: Account = {
      name: args.name,
      type: args.type as unknown as AccountType,
      code: args.code,
      description: args.description,
      taxType: args.taxType,
      bankAccountNumber: args.bankAccountNumber,
      bankAccountType: args.bankAccountType as unknown as Account.BankAccountTypeEnum,
      currencyCode: args.currencyCode as unknown as Account["currencyCode"],
      enablePaymentsToAccount: args.enablePaymentsToAccount,
      showInExpenseClaims: args.showInExpenseClaims,
      addToWatchlist: args.addToWatchlist,
    };

    const response = await createXeroAccount(account);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating account: ${response.error}`,
          },
        ],
      };
    }

    const created = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Account created: ${created.name}`,
            `  Code: ${created.code ?? "none"}`,
            `  ID: ${created.accountID}`,
            `  Type: ${created.type}`,
            `  Status: ${created.status}`,
            created.taxType ? `  Tax Type: ${created.taxType}` : null,
            created.description ? `  Description: ${created.description}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default CreateAccountTool;
