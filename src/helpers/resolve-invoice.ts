import { Invoice } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an invoice number or ID to a Xero invoice.
 *
 * Covers both sides of the ledger: in Xero a bill is an invoice of type
 * ACCPAY and a sales invoice is ACCREC, so a bill number and a sales invoice
 * number resolve the same way.
 *
 * Invoice numbers are organisation-specific and are not guaranteed unique, so
 * an ambiguous match is an error rather than a guess — attaching a supplier
 * document to the wrong bill is not obviously wrong after the fact.
 */
export const resolveInvoice = async (
  invoiceNumberOrId: string,
): Promise<Invoice> => {
  const query = (invoiceNumberOrId ?? "").trim();

  if (!query) {
    throw new Error("No invoice specified.");
  }

  if (GUID.test(query)) {
    const response = await xeroClient.accountingApi.getInvoice(
      xeroClient.tenantId,
      query,
      undefined, // unitdp
      getClientHeaders(),
    );

    const invoice = response.body.invoices?.[0];
    if (!invoice) {
      throw new Error(`No invoice with ID ${query} exists in this organisation.`);
    }
    return invoice;
  }

  const response = await xeroClient.accountingApi.getInvoices(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    undefined, // iDs
    [query], // invoiceNumbers
    undefined, // contactIDs
    undefined, // statuses
    1, // page
    false, // includeArchived
    false, // createdByMyApp
    undefined, // unitdp
    false, // summaryOnly
    100, // pageSize
    undefined, // searchTerm
    getClientHeaders(),
  );

  const matches = response.body.invoices ?? [];

  if (matches.length === 0) {
    throw new Error(
      `No invoice or bill numbered "${query}" exists in this organisation. ` +
        "Use list-invoices to find it, or pass the invoice ID.",
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `"${query}" matches ${matches.length} invoices in this organisation. ` +
        "Pass the invoice ID instead.",
    );
  }

  return matches[0];
};

/** Human label for a resolved invoice, for echoing back in tool output. */
export const describeInvoice = (invoice: Invoice): string =>
  [
    invoice.type === Invoice.TypeEnum.ACCPAY ? "Bill" : "Invoice",
    invoice.invoiceNumber ?? invoice.invoiceID,
    invoice.contact?.name ? `(${invoice.contact.name})` : null,
    invoice.status ? `[${invoice.status}]` : null,
  ]
    .filter(Boolean)
    .join(" ");
