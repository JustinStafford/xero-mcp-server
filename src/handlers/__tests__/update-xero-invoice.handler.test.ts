import { Invoice, LineItem } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { updateXeroInvoice } = await import("../update-xero-invoice.handler.js");

const storedLines: LineItem[] = [
  {
    lineItemID: "l-1",
    description: "Consulting, March",
    quantity: 10,
    unitAmount: 150,
    accountCode: "200",
    taxType: "OUTPUT",
  },
  {
    lineItemID: "l-2",
    description: "Disbursements",
    quantity: 1,
    unitAmount: 42.5,
    accountCode: "200",
    taxType: "OUTPUT",
  },
];

const storedInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  invoiceID: "i-1",
  invoiceNumber: "INV-0042",
  type: Invoice.TypeEnum.ACCPAY,
  status: Invoice.StatusEnum.DRAFT,
  reference: "PO 7781",
  date: "2026-03-01",
  dueDate: "2026-03-31",
  contact: { contactID: "c-1", name: "Jakarta Supplies Pty Ltd" },
  lineItems: storedLines,
  ...overrides,
});

/** The invoice body this handler sent to Xero on the single update call. */
const sentInvoice = (): Invoice => {
  expect(accountingApi.updateInvoice).toHaveBeenCalledTimes(1);
  const [, , invoices] = accountingApi.updateInvoice.mock.calls[0];
  return invoices.invoices[0];
};

const givenStoredInvoice = (invoice: Invoice = storedInvoice()): void => {
  accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [invoice] } });
  accountingApi.updateInvoice.mockImplementation(
    async (_tenant: string, _id: string, invoices: { invoices: Invoice[] }) => ({
      body: { invoices: [{ ...invoice, ...invoices.invoices[0] }] },
    }),
  );
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("updateXeroInvoice", () => {
  it("resends the stored line items when the call supplies none", async () => {
    // The bug this guards: a field-only edit used to send `lineItems:
    // undefined`, which deleted every line on the invoice.
    givenStoredInvoice();

    const response = await updateXeroInvoice("i-1", undefined, "PO 9000");

    expect(response.isError).toBe(false);
    expect(sentInvoice().lineItems).toEqual(storedLines);
  });

  it("replaces the line items when the call supplies them", async () => {
    givenStoredInvoice();

    await updateXeroInvoice("i-1", [
      {
        description: "Consulting, April",
        quantity: 8,
        unitAmount: 150,
        accountCode: "200",
        taxType: "OUTPUT",
      },
    ]);

    const lines = sentInvoice().lineItems ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Consulting, April");
  });

  it("preserves every field the call did not name", async () => {
    givenStoredInvoice();

    await updateXeroInvoice("i-1", undefined, "PO 9000");

    expect(sentInvoice()).toMatchObject({
      reference: "PO 9000",
      date: "2026-03-01",
      dueDate: "2026-03-31",
      contact: { contactID: "c-1" },
    });
  });

  it("overwrites only the named fields", async () => {
    givenStoredInvoice();

    await updateXeroInvoice("i-1", undefined, undefined, "2026-04-30");

    expect(sentInvoice()).toMatchObject({
      reference: "PO 7781",
      dueDate: "2026-04-30",
      date: "2026-03-01",
    });
  });

  it("keeps the invoice on its existing contact when none is supplied", async () => {
    givenStoredInvoice();

    await updateXeroInvoice("i-1", undefined, "PO 9000");

    expect(sentInvoice().contact).toEqual({ contactID: "c-1" });
  });

  it("moves the invoice when a new contact is supplied", async () => {
    givenStoredInvoice();

    await updateXeroInvoice(
      "i-1",
      undefined,
      undefined,
      undefined,
      undefined,
      "c-2",
    );

    expect(sentInvoice().contact).toEqual({ contactID: "c-2" });
  });

  it.each([
    Invoice.StatusEnum.AUTHORISED,
    Invoice.StatusEnum.PAID,
    Invoice.StatusEnum.VOIDED,
  ])("refuses to touch a %s invoice", async (status) => {
    givenStoredInvoice(storedInvoice({ status }));

    const response = await updateXeroInvoice("i-1", undefined, "PO 9000");

    expect(response.isError).toBe(true);
    expect(response.error).toContain("not a draft");
    expect(accountingApi.updateInvoice).not.toHaveBeenCalled();
  });

  it("names the missing invoice and does not write when the ID is unknown", async () => {
    accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [] } });

    const response = await updateXeroInvoice("i-missing", undefined, "PO 9000");

    expect(response.isError).toBe(true);
    expect(response.error).toContain("i-missing");
    expect(accountingApi.updateInvoice).not.toHaveBeenCalled();
  });

  it("handles an invoice stored with no line items at all", async () => {
    givenStoredInvoice(storedInvoice({ lineItems: undefined }));

    const response = await updateXeroInvoice("i-1", undefined, "PO 9000");

    expect(response.isError).toBe(false);
    expect(sentInvoice().lineItems).toEqual([]);
  });
});
