import fs from "node:fs";
import path from "node:path";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface DownloadedAttachment {
  savedTo: string;
  bytes: number;
  fileName: string;
  invoiceLabel: string;
}

/**
 * Download an attachment from a bill or invoice to a local file.
 *
 * Written to disk rather than returned inline: a PDF bill is binary and would
 * be useless — and enormous — in a tool response.
 */
export async function getXeroInvoiceAttachment(
  invoiceNumberOrId: string,
  fileName: string,
  outputPath: string,
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

    // Resolve a directory target to a file inside it, so callers can pass
    // either a directory or a full path.
    let target = path.resolve(outputPath);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, match.fileName ?? "attachment");
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, response.body);

    return {
      result: {
        savedTo: target,
        bytes: response.body.length,
        fileName: match.fileName ?? "attachment",
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
