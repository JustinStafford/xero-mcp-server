import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Invoice, LineItem, LineItemTracking } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  itemCode?: string;
  tracking?: LineItemTracking[];
}

async function getInvoice(invoiceId: string): Promise<Invoice | undefined> {
  await xeroClient.authenticate();

  // First, get the current invoice to check its status
  const response = await xeroClient.accountingApi.getInvoice(
    xeroClient.tenantId,
    invoiceId, // invoiceId
    undefined, // unitdp
    getClientHeaders(), // options
  );

  return response.body.invoices?.[0];
}

async function updateInvoice(
  invoiceId: string,
  existingInvoice: Invoice,
  lineItems?: InvoiceLineItem[],
  reference?: string,
  dueDate?: string,
  date?: string,
  contactId?: string,
): Promise<Invoice | undefined> {
  // Send the stored line items back when the caller supplied none. Omitting
  // them is what previously wiped an invoice's lines on a field-only edit.
  const linesToSend: LineItem[] =
    lineItems ?? existingInvoice.lineItems ?? [];

  const invoice: Invoice = {
    lineItems: linesToSend,
    // Only overwrite a field the caller actually named; everything else keeps
    // the value already on the invoice.
    reference: reference ?? existingInvoice.reference,
    dueDate: dueDate ?? existingInvoice.dueDate,
    date: date ?? existingInvoice.date,
    contact: contactId
      ? { contactID: contactId }
      : existingInvoice.contact?.contactID
        ? { contactID: existingInvoice.contact.contactID }
        : undefined,
  };

  const response = await xeroClient.accountingApi.updateInvoice(
    xeroClient.tenantId,
    invoiceId, // invoiceId
    {
      invoices: [invoice],
    }, // invoices
    undefined, // unitdp
    undefined, // idempotencyKey
    getClientHeaders(), // options
  );

  return response.body.invoices?.[0];
}

/**
 * Update an existing invoice in Xero
 */
export async function updateXeroInvoice(
  invoiceId: string,
  lineItems?: InvoiceLineItem[],
  reference?: string,
  dueDate?: string,
  date?: string,
  contactId?: string,
): Promise<XeroClientResponse<Invoice>> {
  try {
    const existingInvoice = await getInvoice(invoiceId);

    if (!existingInvoice) {
      return {
        result: null,
        isError: true,
        error: `No invoice with ID ${invoiceId} exists in this organisation.`,
      };
    }

    const invoiceStatus = existingInvoice.status;

    // Only allow updates to DRAFT invoices
    if (invoiceStatus !== Invoice.StatusEnum.DRAFT) {
      return {
        result: null,
        isError: true,
        error: `Cannot update invoice because it is not a draft. Current status: ${invoiceStatus}`,
      };
    }

    const updatedInvoice = await updateInvoice(
      invoiceId,
      existingInvoice,
      lineItems,
      reference,
      dueDate,
      date,
      contactId,
    );

    if (!updatedInvoice) {
      throw new Error("Invoice update failed.");
    }

    return {
      result: updatedInvoice,
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
