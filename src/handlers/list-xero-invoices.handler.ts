import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Invoice } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { dateRangeClauses, joinWhere } from "../helpers/xero-where.js";

export interface ListInvoicesFilters {
  page?: number;
  contactIds?: string[];
  invoiceNumbers?: string[];
  statuses?: string[];
  types?: string[];
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Type and date range have no dedicated query parameters, so they go into the
 * `where` clause. Statuses do have one, and are passed there instead.
 */
export const buildInvoiceWhere = (
  filters: ListInvoicesFilters,
): string | undefined => {
  const clauses: string[] = [];

  if (filters.types?.length) {
    const typeClause = filters.types
      .map((type) => `Type=="${type}"`)
      .join(" OR ");
    clauses.push(filters.types.length > 1 ? `(${typeClause})` : typeClause);
  }

  clauses.push(...dateRangeClauses("Date", filters.dateFrom, filters.dateTo));

  return joinWhere(clauses);
};

async function getInvoices(filters: ListInvoicesFilters): Promise<Invoice[]> {
  await xeroClient.authenticate();

  const invoices = await xeroClient.accountingApi.getInvoices(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    buildInvoiceWhere(filters), // where
    "UpdatedDateUTC DESC", // order
    undefined, // iDs
    filters.invoiceNumbers, // invoiceNumbers
    filters.contactIds, // contactIDs
    filters.statuses, // statuses
    filters.page ?? 1,
    false, // includeArchived
    false, // createdByMyApp
    undefined, // unitdp
    false, // summaryOnly
    10, // pageSize
    undefined, // searchTerm
    getClientHeaders(),
  );
  return invoices.body.invoices ?? [];
}

/**
 * List all invoices from Xero
 */
export async function listXeroInvoices(
  filters: ListInvoicesFilters = {},
): Promise<XeroClientResponse<Invoice[]>> {
  try {
    const invoices = await getInvoices(filters);

    return {
      result: invoices,
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
