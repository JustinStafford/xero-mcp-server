import { z } from "zod";
import { Invoice } from "xero-node";

import { getXeroInvoice } from "../../handlers/get-xero-invoice.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { DeepLinkType, getDeepLink } from "../../helpers/get-deeplink.js";
import { formatLineItem } from "../../helpers/format-line-item.js";

const GetInvoiceTool = CreateXeroTool(
  "get-invoice",
  "Get one sales invoice (ACCREC) or supplier bill (ACCPAY) in full, including its line \
items. In Xero a bill and a sales invoice are both invoices, so this covers both. \
Use this before update-invoice so the current state is known.",
  {
    invoiceNumberOrId: z
      .string()
      .describe(
        "The bill or invoice, identified by its number (e.g. 'INV-0042') or its Xero \
invoice ID.",
      ),
  },
  async ({ invoiceNumberOrId }) => {
    const response = await getXeroInvoice(invoiceNumberOrId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting invoice: ${response.error}`,
          },
        ],
      };
    }

    const invoice = response.result;

    const deepLink = invoice.invoiceID
      ? await getDeepLink(
          invoice.type === Invoice.TypeEnum.ACCREC
            ? DeepLinkType.INVOICE
            : DeepLinkType.BILL,
          invoice.invoiceID,
        )
      : null;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Invoice ID: ${invoice.invoiceID}`,
            `Number: ${invoice.invoiceNumber ?? "(none)"}`,
            `Type: ${invoice.type ?? "Unknown"} ${
              invoice.type === Invoice.TypeEnum.ACCPAY
                ? "(supplier bill)"
                : "(sales invoice)"
            }`,
            `Status: ${invoice.status ?? "Unknown"}`,
            invoice.contact
              ? `Contact: ${invoice.contact.name} (${invoice.contact.contactID})`
              : null,
            invoice.reference ? `Reference: ${invoice.reference}` : null,
            invoice.date ? `Date: ${invoice.date}` : null,
            invoice.dueDate ? `Due Date: ${invoice.dueDate}` : null,
            invoice.expectedPaymentDate
              ? `Expected Payment Date: ${invoice.expectedPaymentDate}`
              : null,
            invoice.plannedPaymentDate
              ? `Planned Payment Date: ${invoice.plannedPaymentDate}`
              : null,
            invoice.currencyCode ? `Currency: ${invoice.currencyCode}` : null,
            invoice.currencyRate
              ? `Currency Rate: ${invoice.currencyRate}`
              : null,
            invoice.lineAmountTypes
              ? `Line Amount Types: ${invoice.lineAmountTypes}`
              : null,
            invoice.subTotal !== undefined ? `Sub Total: ${invoice.subTotal}` : null,
            invoice.totalTax !== undefined ? `Total Tax: ${invoice.totalTax}` : null,
            `Total: ${invoice.total ?? 0}`,
            invoice.amountDue !== undefined ? `Amount Due: ${invoice.amountDue}` : null,
            invoice.amountPaid !== undefined
              ? `Amount Paid: ${invoice.amountPaid}`
              : null,
            invoice.hasAttachments ? "Has Attachments: Yes" : null,
            invoice.updatedDateUTC ? `Last Updated: ${invoice.updatedDateUTC}` : null,
            "",
            `Line Items (${invoice.lineItems?.length ?? 0}):`,
            ...(invoice.lineItems ?? []).map(
              (lineItem, index) =>
                `--- Line ${index + 1} (LineItemID: ${lineItem.lineItemID ?? "none"}) ---\n` +
                formatLineItem(lineItem),
            ),
            deepLink ? `\nLink to view: ${deepLink}` : null,
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetInvoiceTool;
