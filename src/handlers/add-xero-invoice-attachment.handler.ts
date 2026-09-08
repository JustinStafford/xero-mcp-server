import fs from "node:fs";
import path from "node:path";

import { Attachment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Xero rejects requests above 3.5MB. Checking locally turns an opaque
 * transport failure into a message that says what to do about it.
 */
const MAX_ATTACHMENT_BYTES = Math.floor(3.5 * 1024 * 1024);

export interface AddedAttachment {
  attachment: Attachment;
  invoiceLabel: string;
}

/**
 * Attach a local file to a bill or invoice.
 *
 * The file is read from the filesystem of the machine running this server —
 * bytes cannot travel through a tool argument at any practical size.
 */
export async function addXeroInvoiceAttachment(
  invoiceNumberOrId: string,
  filePath: string,
  includeOnline: boolean = false,
  fileName?: string,
): Promise<XeroClientResponse<AddedAttachment>> {
  try {
    await xeroClient.authenticate();

    const resolvedPath = path.resolve(filePath);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      throw new Error(
        `No file found at ${resolvedPath}. The file must exist on the machine ` +
          "running this server; a file in the conversation is not visible here.",
      );
    }

    if (!stat.isFile()) {
      throw new Error(`${resolvedPath} is not a file.`);
    }

    if (stat.size === 0) {
      throw new Error(`${resolvedPath} is empty.`);
    }

    if (stat.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `${resolvedPath} is ${(stat.size / 1024 / 1024).toFixed(1)}MB. ` +
          "Xero rejects requests above 3.5MB, so this file must be reduced or " +
          "split before it can be attached.",
      );
    }

    const invoice = await resolveInvoice(invoiceNumberOrId);
    if (!invoice.invoiceID) {
      throw new Error("Resolved invoice has no invoice ID.");
    }

    const body = fs.readFileSync(resolvedPath);
    const name = fileName?.trim() || path.basename(resolvedPath);

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

    return {
      result: { attachment, invoiceLabel: describeInvoice(invoice) },
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
