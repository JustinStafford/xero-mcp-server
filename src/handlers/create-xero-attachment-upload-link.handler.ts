import { tenantContext } from "../clients/tenant-context.js";
import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  describeBankTransaction,
  resolveBankTransaction,
} from "../helpers/resolve-bank-transaction.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { UploadConfig, uploadConfig } from "../uploads/upload-config.js";
import {
  UploadLink,
  UploadTarget,
  getListenerProblem,
  uploadLinks,
} from "../uploads/upload-links.js";

/** Xero's limit on files per record. */
export const MAX_ATTACHMENTS_PER_RECORD = 10;

export interface CreatedUploadLink {
  link: UploadLink;
  url: string;
  config: UploadConfig;
  /** Names of the files already on the record, so a duplicate is noticed first. */
  alreadyAttached: string[];
}

/**
 * Make a one-time link for attaching one file to one record.
 *
 * The record is looked up now, in the organisation this call names, and the
 * link carries its ID: nothing sent to the link later can point it elsewhere.
 */
export async function createXeroAttachmentUploadLink(
  attachTo: UploadTarget["kind"],
  recordId: string,
  includeOnline: boolean = false,
): Promise<XeroClientResponse<CreatedUploadLink>> {
  try {
    const config = uploadConfig();
    if (!config) {
      throw new Error("Upload links aren't switched on for this server.");
    }

    const problem = getListenerProblem();
    if (problem) {
      throw new Error(`${problem} Supply the file as fileBase64 instead.`);
    }

    await xeroClient.authenticate();

    let target: UploadTarget;
    let alreadyAttached: string[];

    if (attachTo === "invoice") {
      const invoice = await resolveInvoice(recordId);
      if (!invoice.invoiceID) {
        throw new Error("Resolved invoice has no invoice ID.");
      }
      const listed = await xeroClient.accountingApi.getInvoiceAttachments(
        xeroClient.tenantId,
        invoice.invoiceID,
        getClientHeaders(),
      );
      alreadyAttached = (listed.body.attachments ?? []).map(
        (attachment) => attachment.fileName ?? "(unnamed)",
      );
      target = {
        kind: "invoice",
        id: invoice.invoiceID,
        label: describeInvoice(invoice),
        includeOnline,
      };
    } else {
      const transaction = await resolveBankTransaction(recordId);
      if (!transaction.bankTransactionID) {
        throw new Error("Resolved bank transaction has no ID.");
      }
      const listed = await xeroClient.accountingApi.getBankTransactionAttachments(
        xeroClient.tenantId,
        transaction.bankTransactionID,
        getClientHeaders(),
      );
      alreadyAttached = (listed.body.attachments ?? []).map(
        (attachment) => attachment.fileName ?? "(unnamed)",
      );
      target = {
        kind: "bank-transaction",
        id: transaction.bankTransactionID,
        label: describeBankTransaction(transaction),
        includeOnline: false,
      };
    }

    if (alreadyAttached.length >= MAX_ATTACHMENTS_PER_RECORD) {
      throw new Error(
        `${target.label} already has ${alreadyAttached.length} attachments, ` +
          `Xero's limit. Remove one in Xero first.`,
      );
    }

    const context = tenantContext.getStore();
    const tenantId = xeroClient.tenantId;
    const link = uploadLinks(config.ttlMs).create(
      tenantId,
      context?.tenantName ?? tenantId,
      target,
    );

    return {
      result: {
        link,
        url: `${config.publicUrl}/${link.token}`,
        config,
        alreadyAttached,
      },
      isError: false,
      error: null,
    };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

/** A link's state, for the organisation it was made in only. */
export function getXeroAttachmentUploadLink(
  linkId: string,
): XeroClientResponse<UploadLink> {
  const config = uploadConfig();
  const link = config
    ? uploadLinks(config.ttlMs).get(xeroClient.tenantId, linkId ?? "")
    : undefined;

  if (!link) {
    return {
      result: null,
      isError: true,
      error:
        `No upload link "${linkId}" in this organisation. Links are forgotten an hour ` +
        "after they expire, and when the server restarts. Use the attachment list " +
        "tools to see what is on the record.",
    };
  }

  return { result: link, isError: false, error: null };
}
