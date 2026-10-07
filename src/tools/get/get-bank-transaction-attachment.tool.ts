import { z } from "zod";

import { getXeroBankTransactionAttachment } from "../../handlers/get-xero-bank-transaction-attachment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const GetBankTransactionAttachmentTool = CreateXeroTool(
  "get-bank-transaction-attachment",
  "Download a file attached to a bank transaction and save it to disk on the machine \
running this server. Use list-bank-transaction-attachments first to see the available \
file names.",
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
    outputPath: z
      .string()
      .describe(
        "Where to save the file: either a full path, or an existing directory to save it \
into under its own name.",
      ),
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

    const result = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Downloaded ${result.fileName} from ${result.transactionLabel}`,
            `  Saved to: ${result.savedTo}`,
            `  Size: ${result.bytes} bytes`,
          ].join("\n"),
        },
      ],
    };
  },
);

export default GetBankTransactionAttachmentTool;
