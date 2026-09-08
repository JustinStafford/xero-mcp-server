import { z } from "zod";

import { addXeroInvoiceAttachment } from "../../handlers/add-xero-invoice-attachment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const AddInvoiceAttachmentTool = CreateXeroTool(
  "add-invoice-attachment",
  "Attach a file to a bill or an invoice. In Xero a bill and a sales invoice are \
both invoices, so this covers both. \
The file is read from the filesystem of the machine running this server, so it must \
already be saved to disk — a file in the conversation is not reachable. Maximum 3.5MB.",
  {
    invoiceNumberOrId: z
      .string()
      .describe(
        "The bill or invoice to attach to, identified by its number (e.g. 'INV-0042') \
or its Xero invoice ID. Numbers are organisation-specific and resolved within the \
organisation named in the organisation argument.",
      ),
    filePath: z
      .string()
      .describe(
        "Absolute path to the file on the machine running this server, e.g. \
'/Users/me/Downloads/supplier-invoice.pdf'.",
      ),
    fileName: z
      .string()
      .optional()
      .describe(
        "Optional name to store the file under in Xero. Defaults to the file's own name.",
      ),
    includeOnline: z
      .boolean()
      .optional()
      .describe(
        "Optional. For a sales invoice, also attach the file to the online invoice the \
CUSTOMER sees. Defaults to false. Only set true when the user has asked for the \
attachment to be visible to the customer.",
      ),
  },
  async ({ invoiceNumberOrId, filePath, fileName, includeOnline }) => {
    const response = await addXeroInvoiceAttachment(
      invoiceNumberOrId,
      filePath,
      includeOnline ?? false,
      fileName,
    );

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

    const { attachment, invoiceLabel } = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Attached to ${invoiceLabel}`,
            `  File: ${attachment.fileName}`,
            `  Size: ${attachment.contentLength} bytes`,
            attachment.mimeType ? `  Type: ${attachment.mimeType}` : null,
            `  Visible on the online invoice: ${attachment.includeOnline ? "yes" : "no"}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default AddInvoiceAttachmentTool;
