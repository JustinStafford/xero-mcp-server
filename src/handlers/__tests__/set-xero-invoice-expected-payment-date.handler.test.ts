import { Invoice } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const {
  setXeroInvoiceExpectedPaymentDate,
  MAX_EXPECTED_PAYMENT_DATE_UPDATES,
} = await import("../set-xero-invoice-expected-payment-date.handler.js");

/** An invoice that is eligible for an expected payment date. */
const eligible = (overrides: Partial<Invoice> = {}): Invoice => ({
  invoiceID: "i-1",
  invoiceNumber: "INV-0042",
  type: Invoice.TypeEnum.ACCREC,
  status: Invoice.StatusEnum.AUTHORISED,
  amountDue: 1650,
  ...overrides,
});

const givenStored = (invoices: Invoice[]): void => {
  accountingApi.getInvoices.mockResolvedValue({ body: { invoices } });
};

const givenXeroAccepts = (invoices?: Invoice[]): void => {
  accountingApi.updateOrCreateInvoices.mockImplementation(
    async (_tenant: string, payload: { invoices: Invoice[] }) => ({
      body: {
        invoices:
          invoices ??
          payload.invoices.map((invoice) => ({
            ...invoice,
            invoiceNumber: "INV-0042",
          })),
      },
    }),
  );
};

/** The invoice bodies this handler sent to Xero. */
const sentInvoices = (): Invoice[] => {
  expect(accountingApi.updateOrCreateInvoices).toHaveBeenCalledTimes(1);
  return accountingApi.updateOrCreateInvoices.mock.calls[0][1].invoices;
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("setXeroInvoiceExpectedPaymentDate", () => {
  it("sends only the invoice ID and the date, so no other field can be lost", async () => {
    // "Preserve all existing fields" holds by construction here: a field that
    // is never sent cannot be overwritten.
    givenStored([eligible()]);
    givenXeroAccepts();

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.isError).toBe(false);
    expect(sentInvoices()).toEqual([
      { invoiceID: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);
  });

  it("reports the date Xero stored, not the date that was asked for", async () => {
    givenStored([eligible()]);
    givenXeroAccepts([
      {
        invoiceID: "i-1",
        invoiceNumber: "INV-0042",
        expectedPaymentDate: "2026-11-30T00:00:00",
      },
    ]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result).toEqual([
      {
        invoiceId: "i-1",
        invoiceNumber: "INV-0042",
        expectedPaymentDate: "2026-11-30T00:00:00",
        updated: true,
      },
    ]);
  });

  it("asks Xero not to discard the batch when one invoice is rejected", async () => {
    givenStored([eligible()]);
    givenXeroAccepts();

    await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    const [, , summarizeErrors] =
      accountingApi.updateOrCreateInvoices.mock.calls[0];
    expect(summarizeErrors).toBe(false);
  });

  it("refuses an empty list", async () => {
    const response = await setXeroInvoiceExpectedPaymentDate([]);

    expect(response.isError).toBe(true);
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });

  it("refuses a batch over the cap before reading anything from Xero", async () => {
    const updates = Array.from(
      { length: MAX_EXPECTED_PAYMENT_DATE_UPDATES + 1 },
      (_, index) => ({
        invoiceId: `i-${index}`,
        expectedPaymentDate: "2026-11-30",
      }),
    );

    const response = await setXeroInvoiceExpectedPaymentDate(updates);

    expect(response.isError).toBe(true);
    expect(response.error).toContain(String(MAX_EXPECTED_PAYMENT_DATE_UPDATES));
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });

  it.each([
    ["30/11/2026", "day-first form"],
    ["2026-13-01", "month 13"],
    ["2026-02-31", "31 February"],
    ["", "an empty string"],
    ["tomorrow", "a word"],
  ])("rejects %s (%s) without sending it to Xero", async (date) => {
    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: date },
    ]);

    expect(response.isError).toBe(false);
    expect(response.result?.[0]).toMatchObject({
      invoiceId: "i-1",
      updated: false,
    });
    expect(response.result?.[0].reason).toContain("ISO date");
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
    expect(accountingApi.updateOrCreateInvoices).not.toHaveBeenCalled();
  });

  it("explains that a supplier bill uses a different field", async () => {
    givenStored([eligible({ type: Invoice.TypeEnum.ACCPAY })]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0].updated).toBe(false);
    expect(response.result?.[0].reason).toContain("PlannedPaymentDate");
    expect(accountingApi.updateOrCreateInvoices).not.toHaveBeenCalled();
  });

  it.each([
    Invoice.StatusEnum.DRAFT,
    Invoice.StatusEnum.PAID,
    Invoice.StatusEnum.VOIDED,
    Invoice.StatusEnum.SUBMITTED,
  ])("refuses a %s invoice", async (status) => {
    givenStored([eligible({ status })]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0].updated).toBe(false);
    expect(response.result?.[0].reason).toContain("AUTHORISED");
    expect(accountingApi.updateOrCreateInvoices).not.toHaveBeenCalled();
  });

  it.each([0, undefined])(
    "refuses an invoice with %s owing",
    async (amountDue) => {
      givenStored([eligible({ amountDue })]);

      const response = await setXeroInvoiceExpectedPaymentDate([
        { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
      ]);

      expect(response.result?.[0].updated).toBe(false);
      expect(response.result?.[0].reason).toContain("Nothing is owing");
      expect(accountingApi.updateOrCreateInvoices).not.toHaveBeenCalled();
    },
  );

  it("reports an ID that does not exist in the organisation", async () => {
    givenStored([]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-missing", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0]).toMatchObject({
      invoiceId: "i-missing",
      updated: false,
    });
    expect(response.result?.[0].reason).toContain("No invoice");
  });

  it("matches IDs regardless of case", async () => {
    // Xero returns GUIDs in a different case than it accepts them.
    givenStored([eligible({ invoiceID: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" })]);
    givenXeroAccepts();

    const response = await setXeroInvoiceExpectedPaymentDate([
      {
        invoiceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        expectedPaymentDate: "2026-11-30",
      },
    ]);

    expect(response.result?.[0].updated).toBe(true);
  });

  it("explains a locked period, which Xero's own message does not", async () => {
    givenStored([eligible()]);
    givenXeroAccepts([
      {
        invoiceID: "i-1",
        invoiceNumber: "INV-0042",
        validationErrors: [
          { message: "The date cannot be before the end of year lock date." },
        ],
      },
    ]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0].updated).toBe(false);
    expect(response.result?.[0].reason).toContain("lock date has to be moved");
  });

  it("passes through a validation error that is not about a lock", async () => {
    givenStored([eligible()]);
    givenXeroAccepts([
      {
        invoiceID: "i-1",
        validationErrors: [{ message: "Something else was wrong." }],
      },
    ]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0].reason).toBe("Something else was wrong.");
  });

  it("flags an invoice Xero did not return as unconfirmed rather than done", async () => {
    givenStored([eligible()]);
    givenXeroAccepts([]);

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.result?.[0].updated).toBe(false);
    expect(response.result?.[0].reason).toContain("unconfirmed");
  });

  it("updates the good invoices in a mixed batch and explains each failure", async () => {
    givenStored([
      eligible({ invoiceID: "i-ok", invoiceNumber: "INV-1" }),
      eligible({
        invoiceID: "i-paid",
        invoiceNumber: "INV-2",
        status: Invoice.StatusEnum.PAID,
      }),
      eligible({
        invoiceID: "i-bill",
        invoiceNumber: "INV-3",
        type: Invoice.TypeEnum.ACCPAY,
      }),
    ]);
    givenXeroAccepts();

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-ok", expectedPaymentDate: "2026-11-30" },
      { invoiceId: "i-paid", expectedPaymentDate: "2026-11-30" },
      { invoiceId: "i-bill", expectedPaymentDate: "2026-11-30" },
      { invoiceId: "i-gone", expectedPaymentDate: "2026-11-30" },
      { invoiceId: "i-baddate", expectedPaymentDate: "30-11-2026" },
    ]);

    expect(response.isError).toBe(false);

    // Only the eligible invoice reached Xero.
    expect(sentInvoices()).toEqual([
      { invoiceID: "i-ok", expectedPaymentDate: "2026-11-30" },
    ]);

    const byId = new Map(response.result?.map((r) => [r.invoiceId, r]));
    expect(byId.get("i-ok")?.updated).toBe(true);
    expect(byId.get("i-paid")?.updated).toBe(false);
    expect(byId.get("i-bill")?.updated).toBe(false);
    expect(byId.get("i-gone")?.updated).toBe(false);
    expect(byId.get("i-baddate")?.updated).toBe(false);
    expect(response.result).toHaveLength(5);
  });

  it("surfaces a transport failure as an error", async () => {
    accountingApi.getInvoices.mockRejectedValue(new Error("network down"));

    const response = await setXeroInvoiceExpectedPaymentDate([
      { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" },
    ]);

    expect(response.isError).toBe(true);
    expect(response.result).toBeNull();
  });
});
