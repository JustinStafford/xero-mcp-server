import { CurrencyCode, Invoice } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { createXeroInvoice } = await import("../create-xero-invoice.handler.js");

const lineItems = [
  {
    description: "Server hosting, March",
    quantity: 1,
    unitAmount: 2_500_000,
    accountCode: "400",
    taxType: "NONE",
  },
];

const givenEnabled = (codes: CurrencyCode[]): void => {
  accountingApi.getCurrencies.mockResolvedValue({
    body: { currencies: codes.map((code) => ({ code })) },
  });
};

const givenXeroAccepts = (): void => {
  accountingApi.createInvoices.mockImplementation(
    async (_tenant: string, payload: { invoices: Invoice[] }) => ({
      body: {
        invoices: [{ ...payload.invoices[0], invoiceID: "i-new" }],
      },
    }),
  );
};

/** The invoice body this handler sent to Xero. */
const sentInvoice = (): Invoice => {
  expect(accountingApi.createInvoices).toHaveBeenCalledTimes(1);
  return accountingApi.createInvoices.mock.calls[0][1].invoices[0];
};

beforeEach(() => {
  resetMockXeroClient();
  givenXeroAccepts();
});

describe("createXeroInvoice currency handling", () => {
  it("omits the currency entirely when none is asked for", async () => {
    // Left unset, Xero uses the organisation's base currency and its own daily
    // rate. Sending a currency explicitly would change existing behaviour.
    const response = await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
    );

    expect(response.isError).toBe(false);
    expect(sentInvoice()).not.toHaveProperty("currencyCode");
    expect(sentInvoice()).not.toHaveProperty("currencyRate");
    expect(accountingApi.getCurrencies).not.toHaveBeenCalled();
  });

  it("sets a currency the organisation has enabled", async () => {
    givenEnabled([CurrencyCode.AUD, CurrencyCode.IDR]);

    const response = await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
      "PO 1",
      "2026-03-01",
      "IDR",
    );

    expect(response.isError).toBe(false);
    expect(sentInvoice().currencyCode).toBe(CurrencyCode.IDR);
  });

  it("will not create a bill in a currency the organisation has not enabled", async () => {
    givenEnabled([CurrencyCode.AUD]);

    const response = await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
      "PO 1",
      "2026-03-01",
      "IDR",
    );

    expect(response.isError).toBe(true);
    expect(response.error).toContain("IDR");
    expect(accountingApi.createInvoices).not.toHaveBeenCalled();
  });

  it("rejects a currency code that is not a currency, before any API call", async () => {
    const response = await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
      "PO 1",
      "2026-03-01",
      "RUPIAH",
    );

    expect(response.isError).toBe(true);
    expect(accountingApi.getCurrencies).not.toHaveBeenCalled();
    expect(accountingApi.createInvoices).not.toHaveBeenCalled();
  });

  it("leaves the rate to Xero unless one is given", async () => {
    givenEnabled([CurrencyCode.USD]);

    await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
      "PO 1",
      "2026-03-01",
      "USD",
    );

    expect(sentInvoice()).not.toHaveProperty("currencyRate");
  });

  it("sets a fixed rate when one is given", async () => {
    givenEnabled([CurrencyCode.USD]);

    await createXeroInvoice(
      "c-1",
      lineItems,
      Invoice.TypeEnum.ACCPAY,
      "PO 1",
      "2026-03-01",
      "USD",
      1.52,
    );

    expect(sentInvoice().currencyRate).toBe(1.52);
  });

  it("creates every bill as a draft", async () => {
    // Nothing this server creates is authorised without a person.
    await createXeroInvoice("c-1", lineItems, Invoice.TypeEnum.ACCPAY);

    expect(sentInvoice().status).toBe(Invoice.StatusEnum.DRAFT);
  });

  it("puts the reference in invoiceNumber for a bill and reference for a sale", async () => {
    await createXeroInvoice("c-1", lineItems, Invoice.TypeEnum.ACCPAY, "PO 1");
    expect(sentInvoice().invoiceNumber).toBe("PO 1");

    accountingApi.createInvoices.mockClear();
    await createXeroInvoice("c-1", lineItems, Invoice.TypeEnum.ACCREC, "PO 1");
    expect(sentInvoice().reference).toBe("PO 1");
  });
});
