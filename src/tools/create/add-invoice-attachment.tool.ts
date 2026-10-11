import { z } from "zod";

import { addXeroInvoiceAttachment } from "../../handlers/add-xero-invoice-attachment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import {
  ATTACHMENT_SOURCE_DESCRIPTION,
  attachmentSourceSchema,
} from "../../helpers/attachment-source-schema.js";

const AddInvoiceAttachmentTool = CreateXeroTool(
  "add-invoice-attachment",
  `Attach a file to a bill or an invoice. In Xero a bill and a sales invoice are \
both invoices, so this covers both. ${ATTACHMENT_SOURCE_DESCRIPTION} \
The attachment is read back from Xero after the upload to confirm it is stored.`,
  {
    invoiceNumberOrId: z
      .string()
      .describe(
        "The bill or invoice to attach to, identified by its number (e.g. 'INV-0042') \
or its Xero invoice ID. Numbers are organisation-specific and resolved within the \
organisation named in the organisation argument.",
      ),
    ...attachmentSourceSchema,
    includeOnline: z
      .boolean()
      .optional()
      .describe(
        "Optional. For a sales invoice, also attach the file to the online invoice the \
CUSTOMER sees. Defaults to false. Only set true when the user has asked for the \
attachment to be visible to the customer.",
      ),
  },
  async ({
    invoiceNumberOrId,
    filePath,
    fileUrl,
    fileBase64,
    fileName,
    includeOnline,
  }) => {
    const response = await addXeroInvoiceAttachment(
      invoiceNumberOrId,
      { filePath, fileUrl, fileBase64, fileName },
      includeOnline ?? false,
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

    const { attachment, invoiceLabel, verified, uploadedBytes } = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Attached to ${invoiceLabel}`,
            `  File: ${attachment.fileName}`,
            `  Size: ${attachment.contentLength ?? uploadedBytes} bytes`,
            attachment.mimeType ? `  Type: ${attachment.mimeType}` : null,
            `  Visible on the online invoice: ${attachment.includeOnline ? "yes" : "no"}`,
            verified
              ? "  Verified: the attachment is stored on the record in Xero."
              : "  Verified: NO — Xero accepted the upload but the attachment did not \
come back when the record was read again. Check it in Xero before relying on it.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default AddInvoiceAttachmentTool;
