import { xeroClient } from "../clients/xero-client.js";
import {
  DeliveredAttachment,
  deliverAttachment,
} from "../helpers/deliver-attachment.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface DownloadedAttachment extends DeliveredAttachment {
  invoiceLabel: string;
}

/** Retrieve an attachment from a bill or invoice, for the response or a local file. */
export async function getXeroInvoiceAttachment(
  invoiceNumberOrId: string,
  fileName: string,
  outputPath?: string,
): Promise<XeroClientResponse<DownloadedAttachment>> {
  try {
    await xeroClient.authenticate();

    const invoice = await resolveInvoice(invoiceNumberOrId);
    if (!invoice.invoiceID) {
      throw new Error("Resolved invoice has no invoice ID.");
    }

    const listed = await xeroClient.accountingApi.getInvoiceAttachments(
      xeroClient.tenantId,
      invoice.invoiceID,
      getClientHeaders(),
    );

    const attachments = listed.body.attachments ?? [];
    const wanted = fileName.trim().toLowerCase();
    const match = attachments.find(
      (attachment) => attachment.fileName?.toLowerCase() === wanted,
    );

    if (!match?.attachmentID) {
      throw new Error(
        `No attachment named "${fileName}" on this record. ` +
          `Available: ${attachments.map((a) => a.fileName).join(", ") || "none"}.`,
      );
    }

    const response = await xeroClient.accountingApi.getInvoiceAttachmentById(
      xeroClient.tenantId,
      invoice.invoiceID,
      match.attachmentID,
      match.mimeType ?? "application/octet-stream",
      getClientHeaders(),
    );

    return {
      result: {
        ...deliverAttachment(
          response.body,
          match.fileName ?? "attachment",
          match.mimeType ?? "application/octet-stream",
          outputPath,
        ),
        invoiceLabel: describeInvoice(invoice),
      },
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
