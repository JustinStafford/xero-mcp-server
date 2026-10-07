import { z } from "zod";

import { listXeroBatchPayments } from "../../handlers/list-xero-batch-payments.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListBatchPaymentsTool = CreateXeroTool(
  "list-batch-payments",
  "List batch payments in Xero, newest first. PAYBATCH is a batch of supplier bill \
payments, RECBATCH a batch of sales invoice receipts. Use get-batch-payment to see the \
individual payments in one of them. The ABA bank file for a batch cannot be retrieved \
through the API — it is exported from the Xero web interface.",
  {
    dateFrom: z
      .string()
      .optional()
      .describe("Only return batches dated on or after this ISO date (YYYY-MM-DD)."),
    dateTo: z
      .string()
      .optional()
      .describe("Only return batches dated on or before this ISO date (YYYY-MM-DD)."),
  },
  async ({ dateFrom, dateTo }) => {
    const response = await listXeroBatchPayments(dateFrom, dateTo);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing batch payments: ${response.error}`,
          },
        ],
      };
    }

    const batches = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${batches.length} batch payment${batches.length === 1 ? "" : "s"}:`,
        },
        ...batches.map((batch) => ({
          type: "text" as const,
          text: [
            `Batch Payment ID: ${batch.batchPaymentID}`,
            `  Date: ${batch.date}`,
            `  Type: ${batch.type}`,
            `  Status: ${batch.status}`,
            `  Payments: ${batch.payments?.length ?? 0}`,
            `  Total: ${batch.totalAmount ?? batch.amount}`,
            batch.account?.name ? `  Bank Account: ${batch.account.name}` : null,
            batch.details ? `  Bank Reference: ${batch.details}` : null,
            batch.isReconciled ? "  Reconciled: yes" : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListBatchPaymentsTool;
