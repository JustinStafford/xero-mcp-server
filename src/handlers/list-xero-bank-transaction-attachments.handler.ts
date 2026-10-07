import { Attachment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  describeBankTransaction,
  resolveBankTransaction,
} from "../helpers/resolve-bank-transaction.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface BankTransactionAttachments {
  attachments: Attachment[];
  transactionLabel: string;
}

/**
 * List the files attached to a bank transaction.
 */
export async function listXeroBankTransactionAttachments(
  bankTransactionId: string,
): Promise<XeroClientResponse<BankTransactionAttachments>> {
  try {
    await xeroClient.authenticate();

    const transaction = await resolveBankTransaction(bankTransactionId);
    if (!transaction.bankTransactionID) {
      throw new Error("Resolved bank transaction has no ID.");
    }

    const response = await xeroClient.accountingApi.getBankTransactionAttachments(
      xeroClient.tenantId,
      transaction.bankTransactionID,
      getClientHeaders(),
    );

    return {
      result: {
        attachments: response.body.attachments ?? [],
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
