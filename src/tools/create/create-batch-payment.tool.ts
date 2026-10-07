import { z } from "zod";

import {
  createXeroBatchPayment,
  MAX_BATCH_PAYMENT_LINES,
} from "../../handlers/create-xero-batch-payment.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { BATCH_PAYMENT_DETAILS_MAX_LENGTH } from "../../handlers/update-xero-contact.handler.js";

/**
 * The ABA file has no API. Saying so in the tool output, every time, is the
 * only way the agent stops looking for a download that does not exist.
 */
const ABA_NOTE =
  "The ABA bank file CANNOT be produced or downloaded through the Xero API. Only the \
batch payment record is created here. To get the ABA file, open the batch payment in \
Xero and export it from there, then upload it to the bank.";

const CreateBatchPaymentTool = CreateXeroTool(
  "create-batch-payment",
  `Create a batch payment for AUTHORISED supplier bills (ACCPAY), paid from one bank \
account. Every bill is checked first — type, status, amount owing, currency, and whether \
the supplier has batch payment bank details on file — and nothing is created unless all \
of them pass. A batch payment is AUTHORISED as soon as it exists and CANNOT be deleted \
through the API, so confirm the list with the user before calling this. ${ABA_NOTE}`,
  {
    accountId: z
      .string()
      .describe(
        "The Xero account ID of the bank account to pay from. Use list-accounts to find it.",
      ),
    payments: z
      .array(
        z.object({
          invoiceId: z
            .string()
            .describe(
              "The Xero invoice ID of the supplier bill. Use list-invoices with \
types=['ACCPAY'] and statuses=['AUTHORISED'] to find bills awaiting payment.",
            ),
          amount: z
            .number()
            .optional()
            .describe(
              "How much to pay against this bill. Defaults to the full amount still owing. \
Cannot be more than that.",
            ),
        }),
      )
      .min(1)
      .max(MAX_BATCH_PAYMENT_LINES),
    date: z
      .string()
      .optional()
      .describe("Payment date as an ISO date (YYYY-MM-DD). Defaults to today."),
    details: z
      .string()
      .max(BATCH_PAYMENT_DETAILS_MAX_LENGTH)
      .optional()
      .describe(
        `The reference sent to the bank for the whole batch. Maximum \
${BATCH_PAYMENT_DETAILS_MAX_LENGTH} characters outside New Zealand.`,
      ),
    reference: z
      .string()
      .optional()
      .describe("New Zealand only. Leave empty for Australian organisations."),
    particulars: z
      .string()
      .optional()
      .describe("New Zealand only. Leave empty for Australian organisations."),
    code: z
      .string()
      .optional()
      .describe("New Zealand only. Leave empty for Australian organisations."),
  },
  async ({ accountId, payments, date, details, reference, particulars, code }) => {
    const response = await createXeroBatchPayment({
      accountId,
      payments,
      date,
      details,
      reference,
      particulars,
      code,
    });

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating batch payment: ${response.error}`,
          },
        ],
      };
    }

    const batch = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Batch payment created:",
            `  Batch Payment ID: ${batch.batchPaymentID}`,
            `  Date: ${batch.date}`,
            `  Type: ${batch.type}`,
            `  Status: ${batch.status}`,
            `  Payments: ${batch.payments?.length ?? 0}`,
            `  Total: ${batch.totalAmount ?? batch.amount}`,
            batch.details ? `  Bank Reference: ${batch.details}` : null,
            "",
            ABA_NOTE,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default CreateBatchPaymentTool;
