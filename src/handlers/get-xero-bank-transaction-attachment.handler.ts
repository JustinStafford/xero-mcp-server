import { xeroClient } from "../clients/xero-client.js";
import {
  DeliveredAttachment,
  deliverAttachment,
} from "../helpers/deliver-attachment.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  describeBankTransaction,
  resolveBankTransaction,
} from "../helpers/resolve-bank-transaction.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface DownloadedBankTransactionAttachment extends DeliveredAttachment {
  transactionLabel: string;
}

/** Retrieve an attachment from a bank transaction, for the response or a local file. */
export async function getXeroBankTransactionAttachment(
  bankTransactionId: string,
  fileName: string,
  outputPath?: string,
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

    return {
      result: {
        ...deliverAttachment(
          response.body,
          match.fileName ?? "attachment",
          match.mimeType ?? "application/octet-stream",
          outputPath,
        ),
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
