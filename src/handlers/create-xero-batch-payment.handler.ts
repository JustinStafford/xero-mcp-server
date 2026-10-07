import { Account, AccountType, BatchPayment, Contact, Invoice } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { isIsoDate } from "../helpers/xero-where.js";
import { BATCH_PAYMENT_DETAILS_MAX_LENGTH } from "./update-xero-contact.handler.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface BatchPaymentLine {
  invoiceId: string;
  amount?: number;
}

export interface CreateBatchPaymentInput {
  accountId: string;
  payments: BatchPaymentLine[];
  date?: string;
  details?: string;
  reference?: string;
  particulars?: string;
  code?: string;
}

/** Xero's own limit on how many payments one batch can hold. */
export const MAX_BATCH_PAYMENT_LINES = 1000;

async function getBankAccount(accountId: string): Promise<Account> {
  const response = await xeroClient.accountingApi.getAccount(
    xeroClient.tenantId,
    accountId,
    getClientHeaders(),
  );

  const account = response.body.accounts?.[0];
  if (!account) {
    throw new Error(
      `No account with ID ${accountId} exists in this organisation. Use list-accounts ` +
        "to find the bank account to pay from.",
    );
  }

  if (account.type !== AccountType.BANK) {
    throw new Error(
      `"${account.name}" is a ${account.type} account, not a bank account. A batch ` +
        "payment must be paid from a bank account.",
    );
  }

  return account;
}

async function getInvoicesByIds(ids: string[]): Promise<Map<string, Invoice>> {
  const response = await xeroClient.accountingApi.getInvoices(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    ids, // iDs
    undefined, // invoiceNumbers
    undefined, // contactIDs
    undefined, // statuses
    1, // page
    false, // includeArchived
    false, // createdByMyApp
    undefined, // unitdp
    true, // summaryOnly
    ids.length, // pageSize
    undefined, // searchTerm
    getClientHeaders(),
  );

  const found = new Map<string, Invoice>();
  for (const invoice of response.body.invoices ?? []) {
    if (invoice.invoiceID) {
      found.set(invoice.invoiceID.toLowerCase(), invoice);
    }
  }
  return found;
}

async function getContactsByIds(ids: string[]): Promise<Map<string, Contact>> {
  // summaryOnly omits the bank blocks, and the bank block is the whole point.
  const response = await xeroClient.accountingApi.getContacts(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    ids, // iDs
    1, // page
    false, // includeArchived
    false, // summaryOnly
    undefined, // searchTerm
    ids.length, // pageSize
    getClientHeaders(),
  );

  const found = new Map<string, Contact>();
  for (const contact of response.body.contacts ?? []) {
    if (contact.contactID) {
      found.set(contact.contactID.toLowerCase(), contact);
    }
  }
  return found;
}

/**
 * Create a batch payment for supplier bills.
 *
 * Everything is checked before the batch is created, because a batch payment is
 * AUTHORISED the moment it exists and cannot be deleted through the API.
 *
 * Note: Xero has no API for the ABA file. This creates the batch payment
 * record; the ABA file is exported from the Xero web interface.
 */
export async function createXeroBatchPayment(
  input: CreateBatchPaymentInput,
): Promise<XeroClientResponse<BatchPayment>> {
  try {
    if (input.payments.length === 0) {
      throw new Error("No bills supplied to pay.");
    }

    if (input.payments.length > MAX_BATCH_PAYMENT_LINES) {
      throw new Error(
        `${input.payments.length} bills supplied. Xero allows at most ` +
          `${MAX_BATCH_PAYMENT_LINES} payments in one batch.`,
      );
    }

    if (input.date && !isIsoDate(input.date)) {
      throw new Error(
        `"${input.date}" is not a valid payment date. Use YYYY-MM-DD.`,
      );
    }

    if (
      input.details !== undefined &&
      input.details.length > BATCH_PAYMENT_DETAILS_MAX_LENGTH
    ) {
      throw new Error(
        `Bank reference "${input.details}" is ${input.details.length} characters. Xero ` +
          `allows at most ${BATCH_PAYMENT_DETAILS_MAX_LENGTH} outside New Zealand.`,
      );
    }

    const duplicates = input.payments
      .map((line) => line.invoiceId.toLowerCase())
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new Error(
        `The same bill appears more than once in this batch: ${[...new Set(duplicates)].join(", ")}.`,
      );
    }

    await xeroClient.authenticate();

    const account = await getBankAccount(input.accountId);
    const invoices = await getInvoicesByIds(
      input.payments.map((line) => line.invoiceId),
    );

    const problems: string[] = [];
    const resolved: Array<{ line: BatchPaymentLine; invoice: Invoice; amount: number }> =
      [];

    for (const line of input.payments) {
      const invoice = invoices.get(line.invoiceId.toLowerCase());

      if (!invoice) {
        problems.push(`${line.invoiceId}: no invoice with this ID exists here.`);
        continue;
      }

      const label = invoice.invoiceNumber ?? line.invoiceId;

      if (invoice.type !== Invoice.TypeEnum.ACCPAY) {
        problems.push(
          `${label}: is a ${invoice.type}, not a supplier bill (ACCPAY). This tool pays bills.`,
        );
        continue;
      }

      if (invoice.status !== Invoice.StatusEnum.AUTHORISED) {
        problems.push(
          `${label}: status is ${invoice.status}. Only AUTHORISED bills can be paid.`,
        );
        continue;
      }

      const amountDue = invoice.amountDue ?? 0;
      if (amountDue <= 0) {
        problems.push(`${label}: nothing is owing on this bill.`);
        continue;
      }

      const amount = line.amount ?? amountDue;
      if (amount <= 0) {
        problems.push(`${label}: amount must be greater than zero.`);
        continue;
      }

      if (amount > amountDue) {
        problems.push(
          `${label}: ${amount} is more than the ${amountDue} still owing.`,
        );
        continue;
      }

      // The API cannot create a multi-currency batch, so a foreign-currency
      // bill has to be paid another way rather than failing inside Xero.
      if (
        invoice.currencyCode !== undefined &&
        account.currencyCode !== undefined &&
        invoice.currencyCode !== account.currencyCode
      ) {
        problems.push(
          `${label}: is in ${invoice.currencyCode} but "${account.name}" is a ` +
            `${account.currencyCode} account. Xero cannot create a multi-currency batch ` +
            "payment through the API — pay this bill on its own instead.",
        );
        continue;
      }

      resolved.push({ line, invoice, amount });
    }

    if (resolved.length > 0) {
      const contactIds = [
        ...new Set(
          resolved
            .map(({ invoice }) => invoice.contact?.contactID)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const contacts = await getContactsByIds(contactIds);

      for (const { invoice } of resolved) {
        const contactId = invoice.contact?.contactID;
        const contact = contactId ? contacts.get(contactId.toLowerCase()) : undefined;
        const label = invoice.invoiceNumber ?? invoice.invoiceID;

        if (!contact?.batchPayments?.bankAccountNumber) {
          problems.push(
            `${label}: supplier "${invoice.contact?.name ?? "unknown"}" has no batch ` +
              "payment bank details on file. Add them with update-contact (batchPayments) " +
              "before including this bill in a batch.",
          );
        }
      }
    }

    // All or nothing: a batch missing a bill is a payment run that has to be
    // reconciled by hand afterwards, which is worse than not creating it.
    if (problems.length > 0) {
      return {
        result: null,
        isError: true,
        error: [
          "No batch payment was created. Fix these first:",
          ...problems.map((problem) => `  - ${problem}`),
        ].join("\n"),
      };
    }

    const batchPayment: BatchPayment = {
      account: { accountID: account.accountID },
      date: input.date || new Date().toISOString().split("T")[0],
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
      ...(input.particulars !== undefined ? { particulars: input.particulars } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      payments: resolved.map(({ invoice, amount }) => ({
        invoice: { invoiceID: invoice.invoiceID },
        amount,
      })),
    };

    const response = await xeroClient.accountingApi.createBatchPayment(
      xeroClient.tenantId,
      { batchPayments: [batchPayment] },
      true, // summarizeErrors — reject the whole batch rather than part of it
      undefined, // idempotencyKey
      getClientHeaders(),
    );

    const created = response.body.batchPayments?.[0];
    if (!created) {
      throw new Error("Batch payment creation returned no batch payment.");
    }

    return {
      result: created,
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
