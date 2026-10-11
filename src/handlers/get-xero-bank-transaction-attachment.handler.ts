import fs from "node:fs";
import path from "node:path";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  describeBankTransaction,
  resolveBankTransaction,
} from "../helpers/resolve-bank-transaction.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface DownloadedBankTransactionAttachment {
  savedTo: string;
  bytes: number;
  fileName: string;
  transactionLabel: string;
}

/**
 * Download an attachment from a bank transaction to a local file.
 *
 * Written to disk rather than returned inline: a PDF receipt is binary and
 * would be useless — and enormous — in a tool response.
 */
export async function getXeroBankTransactionAttachment(
  bankTransactionId: string,
  fileName: string,
  outputPath: string,
): Promise<XeroClientResponse<DownloadedBankTransactionAttachment>> {
  try {
    await xeroClient.authenticate();

    const transaction = await resolveBankTransaction(bankTransactionId);
    if (!transaction.bankTransactionID) {
      throw new Error("Resolved bank transaction has no ID.");
    }

    const listed = await xeroClient.accountingApi.getBankTransactionAttachments(
      xeroClient.tenantId,
      transaction.bankTransactionID,
      getClientHeaders(),
    );

    const attachments = listed.body.attachments ?? [];
    const wanted = fileName.trim().toLowerCase();
    const match = attachments.find(
      (attachment) => attachment.fileName?.toLowerCase() === wanted,
    );

    if (!match?.attachmentID) {
      throw new Error(
        `No attachment named "${fileName}" on this transaction. ` +
          `Available: ${attachments.map((a) => a.fileName).join(", ") || "none"}.`,
      );
    }

    const response = await xeroClient.accountingApi.getBankTransactionAttachmentById(
      xeroClient.tenantId,
      transaction.bankTransactionID,
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
        transactionLabel: describeBankTransaction(transaction),
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
