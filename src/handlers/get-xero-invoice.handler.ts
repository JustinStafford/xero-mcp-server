import { Invoice } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { resolveInvoice } from "../helpers/resolve-invoice.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Fetch one sales invoice or supplier bill, including its line items.
 *
 * list-invoices can find a single record by number, but it pages and returns a
 * summary; reading before an update needs the whole thing.
 */
export async function getXeroInvoice(
  invoiceNumberOrId: string,
): Promise<XeroClientResponse<Invoice>> {
  try {
    await xeroClient.authenticate();

    const invoice = await resolveInvoice(invoiceNumberOrId);

    return {
      result: invoice,
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
