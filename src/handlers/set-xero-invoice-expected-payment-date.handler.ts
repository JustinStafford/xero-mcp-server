import { Invoice } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { isIsoDate } from "../helpers/xero-where.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface ExpectedPaymentDateUpdate {
  invoiceId: string;
  expectedPaymentDate: string;
}

export interface ExpectedPaymentDateOutcome {
  invoiceId: string;
  invoiceNumber?: string;
  expectedPaymentDate?: string;
  updated: boolean;
  reason?: string;
}

/** One tool call, one read page plus one write. Above this, split the batch. */
export const MAX_EXPECTED_PAYMENT_DATE_UPDATES = 100;

/**
 * Xero refuses an edit inside a locked period even though its own web
 * interface allows it, and the raw message does not say what to do.
 */
const LOCK_PERIOD_HINT =
  "This invoice falls inside a locked period. The Xero web interface allows this " +
  "edit but the API does not. The lock date has to be moved before the API can " +
  "set an expected payment date on it.";

const describeValidationErrors = (invoice: Invoice): string => {
  const messages = (invoice.validationErrors ?? [])
    .map((error) => error.message)
    .filter((message): message is string => Boolean(message));

  const joined = messages.join("; ") || "Xero rejected the update without a reason.";

  return /lock|period/i.test(joined) ? `${joined} — ${LOCK_PERIOD_HINT}` : joined;
};

/**
 * Explain why an invoice cannot take an expected payment date, or return null
 * when it can.
 */
const ineligibilityReason = (invoice: Invoice): string | null => {
  if (invoice.type !== Invoice.TypeEnum.ACCREC) {
    return `Type is ${invoice.type}. ExpectedPaymentDate applies to ACCREC sales invoices only; a supplier bill uses PlannedPaymentDate instead.`;
  }

  if (invoice.status !== Invoice.StatusEnum.AUTHORISED) {
    return `Status is ${invoice.status}. Only AUTHORISED invoices can be given an expected payment date.`;
  }

  if ((invoice.amountDue ?? 0) <= 0) {
    return "Nothing is owing on this invoice, so an expected payment date has no meaning.";
  }

  return null;
};

async function fetchInvoicesByIds(ids: string[]): Promise<Map<string, Invoice>> {
  const found = new Map<string, Invoice>();

  const response = await xeroClient.accountingApi.getInvoices(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    ids, // iDs
    undefined, // invoiceNumbers
    undefined, // contactIDs
    undefined, // statuses
    1, // page
    false, // includeArchived
    false, // createdByMyApp
    undefined, // unitdp
    true, // summaryOnly
    ids.length, // pageSize
    undefined, // searchTerm
    getClientHeaders(),
  );

  for (const invoice of response.body.invoices ?? []) {
    if (invoice.invoiceID) {
      found.set(invoice.invoiceID.toLowerCase(), invoice);
    }
  }

  return found;
}

/**
 * Set ExpectedPaymentDate on unpaid authorised sales invoices.
 *
 * Only the invoice ID and the date are sent, so every other field is preserved
 * by construction rather than by remembering to copy it back.
 */
export async function setXeroInvoiceExpectedPaymentDate(
  updates: ExpectedPaymentDateUpdate[],
): Promise<XeroClientResponse<ExpectedPaymentDateOutcome[]>> {
  try {
    if (updates.length === 0) {
      throw new Error("No invoices supplied.");
    }

    if (updates.length > MAX_EXPECTED_PAYMENT_DATE_UPDATES) {
      throw new Error(
        `${updates.length} invoices supplied. Send at most ` +
          `${MAX_EXPECTED_PAYMENT_DATE_UPDATES} per call and split the rest into further calls.`,
      );
    }

    await xeroClient.authenticate();

    const outcomes: ExpectedPaymentDateOutcome[] = [];
    const candidates: ExpectedPaymentDateUpdate[] = [];

    // Local checks first, so a typo costs nothing and never reaches Xero.
    for (const update of updates) {
      if (!isIsoDate(update.expectedPaymentDate)) {
        outcomes.push({
          invoiceId: update.invoiceId,
          updated: false,
          reason: `"${update.expectedPaymentDate}" is not a valid ISO date. Use YYYY-MM-DD, for example 2026-11-30.`,
        });
        continue;
      }
      candidates.push(update);
    }

    if (candidates.length === 0) {
      return { result: outcomes, isError: false, error: null };
    }

    const existing = await fetchInvoicesByIds(
      candidates.map((update) => update.invoiceId),
    );

    const eligible: Array<{
      update: ExpectedPaymentDateUpdate;
      invoice: Invoice;
    }> = [];

    for (const update of candidates) {
      const invoice = existing.get(update.invoiceId.toLowerCase());

      if (!invoice) {
        outcomes.push({
          invoiceId: update.invoiceId,
          updated: false,
          reason: "No invoice with this ID exists in this organisation.",
        });
        continue;
      }

      const reason = ineligibilityReason(invoice);
      if (reason) {
        outcomes.push({
          invoiceId: update.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          updated: false,
          reason,
        });
        continue;
      }

      eligible.push({ update, invoice });
    }

    if (eligible.length === 0) {
      return { result: outcomes, isError: false, error: null };
    }

    const response = await xeroClient.accountingApi.updateOrCreateInvoices(
      xeroClient.tenantId,
      {
        invoices: eligible.map(({ update }) => ({
          invoiceID: update.invoiceId,
          expectedPaymentDate: update.expectedPaymentDate,
        })),
      },
      // One rejected invoice must not discard the rest of the batch.
      false, // summarizeErrors
      undefined, // unitdp
      undefined, // idempotencyKey
      getClientHeaders(),
    );

    const returned = new Map<string, Invoice>();
    for (const invoice of response.body.invoices ?? []) {
      if (invoice.invoiceID) {
        returned.set(invoice.invoiceID.toLowerCase(), invoice);
      }
    }

    for (const { update, invoice } of eligible) {
      const result = returned.get(update.invoiceId.toLowerCase());

      if (!result) {
        outcomes.push({
          invoiceId: update.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          updated: false,
          reason: "Xero did not return this invoice, so the update is unconfirmed.",
        });
        continue;
      }

      if (result.validationErrors?.length) {
        outcomes.push({
          invoiceId: update.invoiceId,
          invoiceNumber: result.invoiceNumber ?? invoice.invoiceNumber,
          updated: false,
          reason: describeValidationErrors(result),
        });
        continue;
      }

      outcomes.push({
        invoiceId: update.invoiceId,
        invoiceNumber: result.invoiceNumber ?? invoice.invoiceNumber,
        expectedPaymentDate:
          result.expectedPaymentDate ?? update.expectedPaymentDate,
        updated: true,
      });
    }

    return { result: outcomes, isError: false, error: null };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
