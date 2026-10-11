import { BankTransaction } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a bank transaction ID to the transaction.
 *
 * Bank transactions have no user-facing number, so there is nothing to look up
 * by other than the ID — but the record is still fetched first, so an error
 * names the wrong transaction rather than failing inside the upload.
 */
export const resolveBankTransaction = async (
  bankTransactionId: string,
): Promise<BankTransaction> => {
  const id = (bankTransactionId ?? "").trim();

  if (!GUID.test(id)) {
    throw new Error(
      `"${bankTransactionId}" is not a bank transaction ID. Use list-bank-transactions ` +
        "to find the transaction and its ID.",
    );
  }

  const response = await xeroClient.accountingApi.getBankTransaction(
    xeroClient.tenantId,
    id,
    undefined, // unitdp
    getClientHeaders(),
  );

  const transaction = response.body.bankTransactions?.[0];
  if (!transaction) {
    throw new Error(
      `No bank transaction with ID ${id} exists in this organisation.`,
    );
  }

  return transaction;
};

/** Human label for a resolved bank transaction, for echoing back. */
export const describeBankTransaction = (
  transaction: BankTransaction,
): string => {
  const kind =
    transaction.type === BankTransaction.TypeEnum.SPEND
      ? "Spend money"
      : transaction.type === BankTransaction.TypeEnum.RECEIVE
        ? "Receive money"
        : (transaction.type?.toString() ?? "Bank transaction");

  return [
    kind,
    transaction.date ? `on ${transaction.date}` : null,
    transaction.contact?.name ? `(${transaction.contact.name})` : null,
    transaction.total !== undefined ? `for ${transaction.total}` : null,
    transaction.reference ? `ref ${transaction.reference}` : null,
  ]
    .filter(Boolean)
    .join(" ");
};
