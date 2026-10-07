import { z } from "zod";

import { addXeroBankTransactionAttachment } from "../../handlers/add-xero-bank-transaction-attachment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import {
  ATTACHMENT_SOURCE_DESCRIPTION,
  attachmentSourceSchema,
} from "../../helpers/attachment-source-schema.js";

const AddBankTransactionAttachmentTool = CreateXeroTool(
  "add-bank-transaction-attachment",
  `Attach a file — typically a PDF receipt or invoice — to a bank transaction. This \
covers spend-money and receive-money transactions. ${ATTACHMENT_SOURCE_DESCRIPTION} \
The attachment is read back from Xero after the upload to confirm it is stored.`,
  {
    bankTransactionId: z
      .string()
      .describe(
        "The Xero bank transaction ID. Use list-bank-transactions to find it.",
      ),
    ...attachmentSourceSchema,
  },
  async ({ bankTransactionId, filePath, fileUrl, fileBase64, fileName }) => {
    const response = await addXeroBankTransactionAttachment(bankTransactionId, {
      filePath,
      fileUrl,
      fileBase64,
      fileName,
    });

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error attaching file: ${response.error}`,
          },
        ],
      };
    }

    const { attachment, transactionLabel, verified, uploadedBytes } =
      response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Attached to ${transactionLabel}`,
            `  File: ${attachment.fileName}`,
            `  Size: ${attachment.contentLength ?? uploadedBytes} bytes`,
            attachment.mimeType ? `  Type: ${attachment.mimeType}` : null,
            verified
              ? "  Verified: the attachment is stored on the transaction in Xero."
              : "  Verified: NO — Xero accepted the upload but the attachment did not \
come back when the transaction was read again. Check it in Xero before relying on it.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default AddBankTransactionAttachmentTool;
