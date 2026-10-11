import { Attachment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  AttachmentSource,
  readAttachmentSource,
} from "../helpers/read-attachment-source.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface AddedAttachment {
  attachment: Attachment;
  invoiceLabel: string;
  /** Read back from Xero after the upload, so "it worked" is not an assumption. */
  verified: boolean;
  uploadedBytes: number;
}

/**
 * Attach a file to a bill or invoice.
 *
 * The file can come from the server's own disk, an https URL, or base64 content —
 * a hosted server has no path the caller can name, so the latter two are what
 * make this usable from a remote client.
 */
export async function addXeroInvoiceAttachment(
  invoiceNumberOrId: string,
  source: AttachmentSource,
  includeOnline: boolean = false,
): Promise<XeroClientResponse<AddedAttachment>> {
  try {
    await xeroClient.authenticate();

    const { body, name } = await readAttachmentSource(source);

    const invoice = await resolveInvoice(invoiceNumberOrId);
    if (!invoice.invoiceID) {
      throw new Error("Resolved invoice has no invoice ID.");
    }

    const response = await xeroClient.accountingApi.createInvoiceAttachmentByFileName(
      xeroClient.tenantId,
      invoice.invoiceID,
      name,
      body,
      includeOnline,
      undefined, // idempotencyKey
      getClientHeaders(),
    );

    const attachment = response.body.attachments?.[0];
    if (!attachment) {
      throw new Error("Attachment upload returned no attachment.");
    }

    const stored = await xeroClient.accountingApi.getInvoiceAttachments(
      xeroClient.tenantId,
      invoice.invoiceID,
      getClientHeaders(),
    );

    const verified = (stored.body.attachments ?? []).some(
      (candidate) => candidate.attachmentID === attachment.attachmentID,
    );

    return {
      result: {
        attachment,
        invoiceLabel: describeInvoice(invoice),
        verified,
        uploadedBytes: body.length,
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
