import { Invoice } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { buildInvoiceWhere, listXeroInvoices } = await import(
  "../list-xero-invoices.handler.js"
);

/** The positional arguments the handler passed to getInvoices. */
const callArgs = () => {
  expect(accountingApi.getInvoices).toHaveBeenCalledTimes(1);
  const call = accountingApi.getInvoices.mock.calls[0];
  return {
    where: call[2],
    invoiceNumbers: call[5],
    contactIDs: call[6],
    statuses: call[7],
    page: call[8],
  };
};

beforeEach(() => {
  resetMockXeroClient();
  accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });
});

describe("buildInvoiceWhere", () => {
  it("returns nothing when there is nothing to filter", () => {
    expect(buildInvoiceWhere({})).toBeUndefined();
  });

  it("filters a single type without needless brackets", () => {
    expect(buildInvoiceWhere({ types: ["ACCPAY"] })).toBe('Type=="ACCPAY"');
  });

  it("brackets an OR of two types so a later AND cannot break it", () => {
    // Without the brackets, adding a date range would change the meaning.
    expect(buildInvoiceWhere({ types: ["ACCPAY", "ACCREC"] })).toBe(
      '(Type=="ACCPAY" OR Type=="ACCREC")',
    );
  });

  it("combines a bracketed type filter with a date range", () => {
    expect(
      buildInvoiceWhere({
        types: ["ACCPAY", "ACCREC"],
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      }),
    ).toBe(
      '(Type=="ACCPAY" OR Type=="ACCREC") AND Date>=DateTime(2026,03,01) AND Date<=DateTime(2026,03,31)',
    );
  });

  it("accepts an open-ended range", () => {
    expect(buildInvoiceWhere({ dateFrom: "2026-03-01" })).toBe(
      "Date>=DateTime(2026,03,01)",
    );
    expect(buildInvoiceWhere({ dateTo: "2026-03-31" })).toBe(
      "Date<=DateTime(2026,03,31)",
    );
  });

  it.each(["01/03/2026", "2026-3-1", "2026-02-31", "March"])(
    "refuses %s rather than sending a broken clause",
    (dateFrom) => {
      expect(() => buildInvoiceWhere({ dateFrom })).toThrowError(/YYYY-MM-DD/);
    },
  );
});

describe("listXeroInvoices", () => {
  it("passes statuses through Xero's own parameter, not the where clause", async () => {
    await listXeroInvoices({ statuses: ["DRAFT"] });

    expect(callArgs().statuses).toEqual(["DRAFT"]);
    expect(callArgs().where).toBeUndefined();
  });

  it("answers 'show me all draft bills' in one call", async () => {
    // Before this, the only way was paging through everything ten at a time.
    await listXeroInvoices({ statuses: ["DRAFT"], types: ["ACCPAY"] });

    expect(callArgs()).toMatchObject({
      statuses: ["DRAFT"],
      where: 'Type=="ACCPAY"',
      page: 1,
    });
  });

  it("keeps the existing contact and invoice-number filters working", async () => {
    await listXeroInvoices({
      contactIds: ["c-1"],
      invoiceNumbers: ["INV-0042"],
      page: 3,
    });

    expect(callArgs()).toMatchObject({
      contactIDs: ["c-1"],
      invoiceNumbers: ["INV-0042"],
      page: 3,
    });
  });

  it("reports a bad date as an error instead of listing the wrong invoices", async () => {
    const response = await listXeroInvoices({ dateFrom: "01/03/2026" });

    expect(response.isError).toBe(true);
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });

  it("returns an empty list rather than undefined", async () => {
    accountingApi.getInvoices.mockResolvedValue({ body: {} });

    const response = await listXeroInvoices();

    expect(response.isError).toBe(false);
    expect(response.result).toEqual([]);
  });

  it("returns the invoices Xero gave back", async () => {
    const invoice: Invoice = {
      invoiceID: "i-1",
      type: Invoice.TypeEnum.ACCPAY,
      status: Invoice.StatusEnum.DRAFT,
    };
    accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [invoice] } });

    const response = await listXeroInvoices({ statuses: ["DRAFT"] });

    expect(response.result).toEqual([invoice]);
  });
});
