import { z } from "zod";
import { listXeroInvoices } from "../../handlers/list-xero-invoices.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatLineItem } from "../../helpers/format-line-item.js";

const ListInvoicesTool = CreateXeroTool(
  "list-invoices",
  "List sales invoices (ACCREC) and supplier bills (ACCPAY) in Xero. \
  Filter with statuses and types rather than paging through everything — \
  for example types=['ACCPAY'] and statuses=['DRAFT'] for draft supplier bills. \
  Ask the user if they want the next page of invoices after running this tool \
  if 10 invoices are returned. \
  If they want the next page, call this tool again with the next page number \
  and the same filters.",
  {
    page: z.number(),
    contactIds: z.array(z.string()).optional(),
    invoiceNumbers: z
      .array(z.string())
      .optional()
      .describe("If provided, invoice line items will also be returned"),
    statuses: z
      .array(z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"]))
      .optional()
      .describe(
        "Only return invoices with these statuses. Omit to return every status.",
      ),
    types: z
      .array(z.enum(["ACCREC", "ACCPAY"]))
      .optional()
      .describe(
        "ACCREC for sales invoices, ACCPAY for supplier bills. Omit to return both.",
      ),
    dateFrom: z
      .string()
      .optional()
      .describe("Only return invoices dated on or after this ISO date (YYYY-MM-DD)."),
    dateTo: z
      .string()
      .optional()
      .describe("Only return invoices dated on or before this ISO date (YYYY-MM-DD)."),
  },
  async ({ page, contactIds, invoiceNumbers, statuses, types, dateFrom, dateTo }) => {
    const response = await listXeroInvoices({
      page,
      contactIds,
      invoiceNumbers,
      statuses,
      types,
      dateFrom,
      dateTo,
    });
    if (response.error !== null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing invoices: ${response.error}`,
          },
        ],
      };
    }

    const invoices = response.result;
    const returnLineItems = (invoiceNumbers?.length ?? 0) > 0;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${invoices?.length || 0} invoices:`,
        },
        ...(invoices?.map((invoice) => ({
          type: "text" as const,
          text: [
            `Invoice ID: ${invoice.invoiceID}`,
            `Invoice: ${invoice.invoiceNumber}`,
            invoice.reference ? `Reference: ${invoice.reference}` : null,
            `Type: ${invoice.type || "Unknown"}`,
            `Status: ${invoice.status || "Unknown"}`,
            invoice.contact
              ? `Contact: ${invoice.contact.name} (${invoice.contact.contactID})`
              : null,
            invoice.date ? `Date: ${invoice.date}` : null,
            invoice.dueDate ? `Due Date: ${invoice.dueDate}` : null,
            invoice.expectedPaymentDate
              ? `Expected Payment Date: ${invoice.expectedPaymentDate}`
              : null,
            invoice.plannedPaymentDate
              ? `Planned Payment Date: ${invoice.plannedPaymentDate}`
              : null,
            invoice.lineAmountTypes
              ? `Line Amount Types: ${invoice.lineAmountTypes}`
              : null,
            invoice.subTotal ? `Sub Total: ${invoice.subTotal}` : null,
            invoice.totalTax ? `Total Tax: ${invoice.totalTax}` : null,
            `Total: ${invoice.total || 0}`,
            invoice.totalDiscount
              ? `Total Discount: ${invoice.totalDiscount}`
              : null,
            invoice.currencyCode ? `Currency: ${invoice.currencyCode}` : null,
            invoice.currencyRate
              ? `Currency Rate: ${invoice.currencyRate}`
              : null,
            invoice.updatedDateUTC
              ? `Last Updated: ${invoice.updatedDateUTC}`
              : null,
            invoice.fullyPaidOnDate
              ? `Fully Paid On: ${invoice.fullyPaidOnDate}`
              : null,
            invoice.amountDue ? `Amount Due: ${invoice.amountDue}` : null,
            invoice.amountPaid ? `Amount Paid: ${invoice.amountPaid}` : null,
            invoice.amountCredited
              ? `Amount Credited: ${invoice.amountCredited}`
              : null,
            invoice.hasErrors ? "Has Errors: Yes" : null,
            invoice.isDiscounted ? "Is Discounted: Yes" : null,
            returnLineItems
              ? `Line Items: ${invoice.lineItems?.map(formatLineItem)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListInvoicesTool;
