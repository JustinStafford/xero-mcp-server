import { z } from "zod";

import { getXeroBatchPayment } from "../../handlers/list-xero-batch-payments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const GetBatchPaymentTool = CreateXeroTool(
  "get-batch-payment",
  "Get one batch payment in full, including every payment it contains. The ABA bank file \
for the batch cannot be retrieved through the API — it is exported from the Xero web \
interface.",
  {
    batchPaymentId: z
      .string()
      .describe(
        "The Xero batch payment ID. Use list-batch-payments to find it.",
      ),
  },
  async ({ batchPaymentId }) => {
    const response = await getXeroBatchPayment(batchPaymentId);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting batch payment: ${response.error}`,
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
            `Batch Payment ID: ${batch.batchPaymentID}`,
            `Date: ${batch.date}`,
            `Type: ${batch.type}`,
            `Status: ${batch.status}`,
            `Total: ${batch.totalAmount ?? batch.amount}`,
            batch.account?.name ? `Bank Account: ${batch.account.name}` : null,
            batch.details ? `Bank Reference: ${batch.details}` : null,
            batch.isReconciled ? "Reconciled: yes" : "Reconciled: no",
            "",
            `Payments (${batch.payments?.length ?? 0}):`,
            ...(batch.payments ?? []).map((payment) =>
              [
                `  ${payment.invoice?.invoiceNumber ?? payment.invoice?.invoiceID ?? "unknown invoice"}`,
                payment.invoice?.contact?.name
                  ? `    Supplier: ${payment.invoice.contact.name}`
                  : null,
                `    Amount: ${payment.amount}`,
                payment.reference ? `    Reference: ${payment.reference}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetBatchPaymentTool;
