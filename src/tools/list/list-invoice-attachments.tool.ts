import { z } from "zod";

import { listXeroInvoiceAttachments } from "../../handlers/list-xero-invoice-attachments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListInvoiceAttachmentsTool = CreateXeroTool(
  "list-invoice-attachments",
  "List the files attached to a bill or an invoice. Use get-invoice-attachment to \
download one of them.",
  {
    invoiceNumberOrId: z
      .string()
      .describe(
        "The bill or invoice, identified by its number (e.g. 'INV-0042') or its Xero \
invoice ID.",
      ),
  },
  async ({ invoiceNumberOrId }) => {
    const response = await listXeroInvoiceAttachments(invoiceNumberOrId);

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

    const { attachments, invoiceLabel } = response.result;

    if (attachments.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `${invoiceLabel} has no attachments.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${invoiceLabel} has ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}:`,
            "",
            ...attachments.map((attachment) =>
              [
                `${attachment.fileName}`,
                `  Type: ${attachment.mimeType ?? "unknown"}`,
                `  Size: ${attachment.contentLength ?? "unknown"} bytes`,
                `  Visible on the online invoice: ${attachment.includeOnline ? "yes" : "no"}`,
              ].join("\n"),
            ),
          ].join("\n"),
        },
      ],
    };
  },
);

export default ListInvoiceAttachmentsTool;
