import { z } from "zod";

import {
  MAX_EXPECTED_PAYMENT_DATE_UPDATES,
  setXeroInvoiceExpectedPaymentDate,
} from "../../handlers/set-xero-invoice-expected-payment-date.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const SetInvoiceExpectedPaymentDateTool = CreateXeroTool(
  "set-invoice-expected-payment-date",
  "Set the expected payment date on unpaid AUTHORISED sales invoices (ACCREC). \
Takes an invoice ID and an ISO date — no line items are needed, and every other field \
on the invoice is left exactly as it is. Several invoices can be updated in one call, \
and one rejected invoice does not stop the others. \
This does not work on supplier bills, drafts, paid or voided invoices, and it fails on \
an invoice inside a locked period even though the Xero web interface allows that edit.",
  {
    updates: z
      .array(
        z.object({
          invoiceId: z
            .string()
            .describe(
              "The Xero invoice ID. Use list-invoices or get-invoice to find it.",
            ),
          expectedPaymentDate: z
            .string()
            .describe("The expected payment date as an ISO date, e.g. 2026-11-30."),
        }),
      )
      .min(1)
      .max(MAX_EXPECTED_PAYMENT_DATE_UPDATES)
      .describe(
        `One entry per invoice, up to ${MAX_EXPECTED_PAYMENT_DATE_UPDATES} per call.`,
      ),
  },
  async ({ updates }) => {
    const response = await setXeroInvoiceExpectedPaymentDate(updates);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error setting expected payment date: ${response.error}`,
          },
        ],
      };
    }

    const outcomes = response.result;
    const updated = outcomes.filter((outcome) => outcome.updated);
    const rejected = outcomes.filter((outcome) => !outcome.updated);

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${updated.length} of ${outcomes.length} invoice${outcomes.length === 1 ? "" : "s"} updated.`,
            ...(updated.length
              ? [
                  "",
                  "Updated:",
                  ...updated.map(
                    (outcome) =>
                      `  ${outcome.invoiceNumber ?? outcome.invoiceId} → ${outcome.expectedPaymentDate}`,
                  ),
                ]
              : []),
            ...(rejected.length
              ? [
                  "",
                  "Not updated:",
                  ...rejected.map(
                    (outcome) =>
                      `  ${outcome.invoiceNumber ?? outcome.invoiceId}: ${outcome.reason}`,
                  ),
                ]
              : []),
          ].join("\n"),
        },
      ],
    };
  },
);

export default SetInvoiceExpectedPaymentDateTool;
