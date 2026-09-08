import { Attachment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { describeInvoice, resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface InvoiceAttachments {
  attachments: Attachment[];
  invoiceLabel: string;
}

/**
 * List the files attached to a bill or invoice.
 */
export async function listXeroInvoiceAttachments(
  invoiceNumberOrId: string,
): Promise<XeroClientResponse<InvoiceAttachments>> {
  try {
    await xeroClient.authenticate();

    const invoice = await resolveInvoice(invoiceNumberOrId);
    if (!invoice.invoiceID) {
      throw new Error("Resolved invoice has no invoice ID.");
    }

    const response = await xeroClient.accountingApi.getInvoiceAttachments(
      xeroClient.tenantId,
      invoice.invoiceID,
      getClientHeaders(),
    );

    return {
      result: {
        attachments: response.body.attachments ?? [],
        invoiceLabel: describeInvoice(invoice),
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
