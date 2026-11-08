import { z } from "zod";

import { getXeroInvoiceAttachment } from "../../handlers/get-xero-invoice-attachment.handler.js";
import {
  attachmentOutputSchema,
  describeAttachmentDelivery,
} from "../../helpers/attachment-source-schema.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { deliveredAttachmentContent } from "../../helpers/deliver-attachment.js";

const GetInvoiceAttachmentTool = CreateXeroTool(
  "get-invoice-attachment",
  `Retrieve a file attached to a bill or an invoice. ${describeAttachmentDelivery()} \
Use list-invoice-attachments first to see the available file names.`,
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
    ...attachmentOutputSchema(),
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

    return {
      content: deliveredAttachmentContent(
        response.result,
        response.result.invoiceLabel,
      ),
    };
  },
);

export default GetInvoiceAttachmentTool;
