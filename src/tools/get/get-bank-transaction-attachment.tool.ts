import { z } from "zod";

import { getXeroBankTransactionAttachment } from "../../handlers/get-xero-bank-transaction-attachment.handler.js";
import {
  attachmentOutputSchema,
  describeAttachmentDelivery,
} from "../../helpers/attachment-source-schema.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { deliveredAttachmentContent } from "../../helpers/deliver-attachment.js";

const GetBankTransactionAttachmentTool = CreateXeroTool(
  "get-bank-transaction-attachment",
  `Retrieve a file attached to a bank transaction. ${describeAttachmentDelivery()} \
Use list-bank-transaction-attachments first to see the available file names.`,
  {
    bankTransactionId: z
      .string()
      .describe(
        "The Xero bank transaction ID. Use list-bank-transactions to find it.",
      ),
    fileName: z
      .string()
      .describe(
        "Name of the attachment to download, as shown by list-bank-transaction-attachments",
      ),
    ...attachmentOutputSchema(),
  },
  async ({ bankTransactionId, fileName, outputPath }) => {
    const response = await getXeroBankTransactionAttachment(
      bankTransactionId,
      fileName,
      outputPath,
    );

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error downloading attachment: ${response.error}`,
          },
        ],
      };
    }

    return {
      content: deliveredAttachmentContent(
        response.result,
        response.result.transactionLabel,
      ),
    };
  },
);

export default GetBankTransactionAttachmentTool;
