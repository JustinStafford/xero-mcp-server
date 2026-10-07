import { Attachment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  AttachmentSource,
  readAttachmentSource,
} from "../helpers/read-attachment-source.js";
import {
  describeBankTransaction,
  resolveBankTransaction,
} from "../helpers/resolve-bank-transaction.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface AddedBankTransactionAttachment {
  attachment: Attachment;
  transactionLabel: string;
  /** Read back from Xero after the upload, so "it worked" is not an assumption. */
  verified: boolean;
  uploadedBytes: number;
}

/**
 * Attach a receipt or other document to a spend-money or receive-money
 * transaction.
 */
export async function addXeroBankTransactionAttachment(
  bankTransactionId: string,
  source: AttachmentSource,
): Promise<XeroClientResponse<AddedBankTransactionAttachment>> {
  try {
    await xeroClient.authenticate();

    const { body, name } = await readAttachmentSource(source);

    const transaction = await resolveBankTransaction(bankTransactionId);
    if (!transaction.bankTransactionID) {
      throw new Error("Resolved bank transaction has no ID.");
    }

    const response =
      await xeroClient.accountingApi.createBankTransactionAttachmentByFileName(
        xeroClient.tenantId,
        transaction.bankTransactionID,
        name,
        body,
        undefined, // idempotencyKey
        getClientHeaders(),
      );

    const attachment = response.body.attachments?.[0];
    if (!attachment) {
      throw new Error("Attachment upload returned no attachment.");
    }

    const stored = await xeroClient.accountingApi.getBankTransactionAttachments(
      xeroClient.tenantId,
      transaction.bankTransactionID,
      getClientHeaders(),
    );

    const verified = (stored.body.attachments ?? []).some(
      (candidate) => candidate.attachmentID === attachment.attachmentID,
    );

    return {
      result: {
        attachment,
        transactionLabel: describeBankTransaction(transaction),
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
