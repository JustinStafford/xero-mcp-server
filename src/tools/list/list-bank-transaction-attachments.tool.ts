import { z } from "zod";

import { listXeroBankTransactionAttachments } from "../../handlers/list-xero-bank-transaction-attachments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListBankTransactionAttachmentsTool = CreateXeroTool(
  "list-bank-transaction-attachments",
  "List the files attached to a bank transaction, so a spend-money transaction can be \
checked for its receipt. Use get-bank-transaction-attachment to download one of them.",
  {
    bankTransactionId: z
      .string()
      .describe(
        "The Xero bank transaction ID. Use list-bank-transactions to find it.",
      ),
  },
  async ({ bankTransactionId }) => {
    const response = await listXeroBankTransactionAttachments(bankTransactionId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing attachments: ${response.error}`,
          },
        ],
      };
    }

    const { attachments, transactionLabel } = response.result;

    if (attachments.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `${transactionLabel} has no attachments.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${transactionLabel} has ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}:`,
            "",
            ...attachments.map((attachment) =>
              [
                `${attachment.fileName}`,
                `  Type: ${attachment.mimeType ?? "unknown"}`,
                `  Size: ${attachment.contentLength ?? "unknown"} bytes`,
              ].join("\n"),
            ),
          ].join("\n"),
        },
      ],
    };
  },
);

export default ListBankTransactionAttachmentsTool;
