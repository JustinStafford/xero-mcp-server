import { z } from "zod";

import { getXeroInvoiceAttachment } from "../../handlers/get-xero-invoice-attachment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const GetInvoiceAttachmentTool = CreateXeroTool(
  "get-invoice-attachment",
  "Download a file attached to a bill or an invoice and save it to disk on the machine \
running this server. Use list-invoice-attachments first to see the available file names.",
  {
    invoiceNumberOrId: z
      .string()
      .describe(
        "The bill or invoice, identified by its number (e.g. 'INV-0042') or its Xero \
invoice ID.",
      ),
    fileName: z
      .string()
      .describe("Name of the attachment to download, as shown by list-invoice-attachments"),
    outputPath: z
      .string()
      .describe(
        "Where to save the file: either a full path, or an existing directory to save it \
into under its own name.",
      ),
  },
  async ({ invoiceNumberOrId, fileName, outputPath }) => {
    const response = await getXeroInvoiceAttachment(
      invoiceNumberOrId,
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
            `Downloaded ${result.fileName} from ${result.invoiceLabel}`,
            `  Saved to: ${result.savedTo}`,
            `  Size: ${result.bytes} bytes`,
          ].join("\n"),
        },
      ],
    };
  },
);

export default GetInvoiceAttachmentTool;
