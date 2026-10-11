import { z } from "zod";
import { Contact } from "xero-node";

import { BATCH_PAYMENT_DETAILS_MAX_LENGTH } from "../handlers/update-xero-contact.handler.js";

/**
 * Shared by create-contact and update-contact so a supplier set up in one step
 * is indistinguishable from one corrected later.
 *
 * Two different bank fields exist on a Xero contact and the difference matters:
 * `bankAccountDetails` is a single informational text field, while the
 * `batchPayments` block is what batch payments and the ABA export actually read.
 */
export const bankAccountDetailsSchema = z
  .string()
  .optional()
  .describe(
    "Informational bank account number stored on the contact. This field is NOT used \
by batch payments or the ABA export — use batchPayments for that.",
  );

export const batchPaymentsSchema = z
  .object({
    bankAccountNumber: z
      .string()
      .optional()
      .describe(
        "The supplier's bank account number, e.g. an Australian BSB and account number.",
      ),
    bankAccountName: z
      .string()
      .optional()
      .describe("The account name held at the bank."),
    details: z
      .string()
      .max(BATCH_PAYMENT_DETAILS_MAX_LENGTH)
      .optional()
      .describe(
        `The reference sent to the bank with the payment. Maximum \
${BATCH_PAYMENT_DETAILS_MAX_LENGTH} characters outside New Zealand.`,
      ),
    code: z
      .string()
      .optional()
      .describe("New Zealand only. Leave empty for Australian organisations."),
    reference: z
      .string()
      .optional()
      .describe("New Zealand only. Leave empty for Australian organisations."),
  })
  .optional()
  .describe(
    "Structured bank details used for batch payments and the ABA export. This is the \
block that must be populated before a supplier can be paid in a batch.",
  );

/**
 * Render a contact's bank details for tool output, including the absence of
 * them — "which suppliers cannot be paid in a batch?" is the question this
 * answers, and a silent omission reads as a populated field.
 */
export const formatContactBankDetails = (contact: Contact): string[] => {
  const batch = contact.batchPayments;
  const hasBatchDetails = Boolean(
    batch?.bankAccountNumber || batch?.bankAccountName,
  );

  return [
    contact.bankAccountDetails
      ? `Bank Account Details (informational): ${contact.bankAccountDetails}`
      : null,
    hasBatchDetails
      ? [
          "Batch Payment Bank Details:",
          batch?.bankAccountName ? `  Account Name: ${batch.bankAccountName}` : null,
          batch?.bankAccountNumber
            ? `  Account Number: ${batch.bankAccountNumber}`
            : null,
          batch?.details ? `  Bank Reference: ${batch.details}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "Batch Payment Bank Details: none on file (cannot be included in a batch payment)",
  ].filter((line): line is string => Boolean(line));
};
