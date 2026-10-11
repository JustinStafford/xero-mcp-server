import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BankTransaction, CurrencyCode, Invoice } from "xero-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { getXeroInvoice } = await import("../get-xero-invoice.handler.js");
const { listXeroCurrencies } = await import("../list-xero-currencies.handler.js");
const { listXeroContacts } = await import("../list-xero-contacts.handler.js");
const { listXeroBankTransactionAttachments } = await import(
  "../list-xero-bank-transaction-attachments.handler.js"
);
const { getXeroBankTransactionAttachment } = await import(
  "../get-xero-bank-transaction-attachment.handler.js"
);

const TRANSACTION_ID = "11111111-2222-3333-4444-555555555555";
const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const transaction: BankTransaction = {
  bankTransactionID: TRANSACTION_ID,
  type: BankTransaction.TypeEnum.SPEND,
  date: "2026-03-14",
  total: 412.5,
  contact: { name: "Uber" },
  lineItems: [],
  bankAccount: {},
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("getXeroInvoice", () => {
  it("returns the full invoice including line items", async () => {
    const invoice: Invoice = {
      invoiceID: INVOICE_ID,
      invoiceNumber: "PO 7781",
      type: Invoice.TypeEnum.ACCPAY,
      lineItems: [{ description: "Hosting", quantity: 1, unitAmount: 100 }],
    };
    accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [invoice] } });

    const response = await getXeroInvoice(INVOICE_ID);

    expect(response.isError).toBe(false);
    expect(response.result?.lineItems).toHaveLength(1);
  });

  it("looks a bill up by its number too", async () => {
    accountingApi.getInvoices.mockResolvedValue({
      body: { invoices: [{ invoiceID: INVOICE_ID, invoiceNumber: "PO 7781" }] },
    });

    const response = await getXeroInvoice("PO 7781");

    expect(response.isError).toBe(false);
    expect(response.result?.invoiceNumber).toBe("PO 7781");
  });

  it("errors on an empty reference without calling Xero", async () => {
    const response = await getXeroInvoice("   ");

    expect(response.isError).toBe(true);
    expect(accountingApi.getInvoice).not.toHaveBeenCalled();
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });

  it("says what to do when a number matches nothing", async () => {
    accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });

    const response = await getXeroInvoice("PO 9999");

    expect(response.isError).toBe(true);
    expect(response.error).toContain("list-invoices");
  });
});

describe("listXeroCurrencies", () => {
  it("returns the currencies the organisation has enabled", async () => {
    accountingApi.getCurrencies.mockResolvedValue({
      body: { currencies: [{ code: CurrencyCode.AUD }, { code: CurrencyCode.IDR }] },
    });

    const response = await listXeroCurrencies();

    expect(response.isError).toBe(false);
    expect(response.result?.map((c) => c.code)).toEqual(["AUD", "IDR"]);
  });

  it("reports a failure rather than an empty organisation", async () => {
    accountingApi.getCurrencies.mockRejectedValue(new Error("no access"));

    const response = await listXeroCurrencies();

    expect(response.isError).toBe(true);
    expect(response.result).toBeNull();
  });
});

describe("listXeroContacts", () => {
  const summaryOnlyArg = () => accountingApi.getContacts.mock.calls[0][7];

  beforeEach(() => {
    accountingApi.getContacts.mockResolvedValue({ body: { contacts: [] } });
  });

  it("asks Xero for the full record when bank details are wanted", async () => {
    // Xero's summary view omits the bank blocks entirely, so the default view
    // would answer "which suppliers have bank details?" with "none of them".
    await listXeroContacts(1, undefined, true);

    expect(summaryOnlyArg()).toBe(false);
  });

  it("keeps the cheaper summary view when they are not", async () => {
    await listXeroContacts(1, undefined, false);

    expect(summaryOnlyArg()).toBe(true);
  });

  it("defaults to the summary view", async () => {
    await listXeroContacts();

    expect(summaryOnlyArg()).toBe(true);
  });

  it("passes the search term through", async () => {
    await listXeroContacts(2, "Jakarta", true);

    const call = accountingApi.getContacts.mock.calls[0];
    expect(call[5]).toBe(2);
    expect(call[8]).toBe("Jakarta");
  });
});

describe("listXeroBankTransactionAttachments", () => {
  it("lists the attachments with a label for the transaction", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-1", fileName: "receipt.pdf" }] },
    });

    const response = await listXeroBankTransactionAttachments(TRANSACTION_ID);

    expect(response.isError).toBe(false);
    expect(response.result?.attachments).toHaveLength(1);
    expect(response.result?.transactionLabel).toContain("Spend money");
  });

  it("returns an empty list rather than undefined", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({ body: {} });

    const response = await listXeroBankTransactionAttachments(TRANSACTION_ID);

    expect(response.result?.attachments).toEqual([]);
  });

  it("rejects something that is not a transaction ID", async () => {
    const response = await listXeroBankTransactionAttachments("Uber receipts");

    expect(response.isError).toBe(true);
    expect(accountingApi.getBankTransaction).not.toHaveBeenCalled();
  });
});

describe("getXeroBankTransactionAttachment", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xero-download-"));
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: {
        attachments: [
          {
            attachmentID: "a-1",
            fileName: "receipt.pdf",
            mimeType: "application/pdf",
          },
        ],
      },
    });
    accountingApi.getBankTransactionAttachmentById.mockResolvedValue({
      body: Buffer.from("%PDF-1.4 downloaded"),
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes the file to a full path", async () => {
    const target = path.join(tempDir, "saved.pdf");

    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "receipt.pdf",
      target,
    );

    expect(response.isError).toBe(false);
    expect(response.result?.savedTo).toBe(target);
    expect(fs.readFileSync(target).toString()).toContain("%PDF-1.4");
  });

  it("writes into a directory when given one, using the stored name", async () => {
    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "receipt.pdf",
      tempDir,
    );

    expect(response.result?.savedTo).toBe(path.join(tempDir, "receipt.pdf"));
    expect(fs.existsSync(path.join(tempDir, "receipt.pdf"))).toBe(true);
  });

  it("creates the parent directory if it is missing", async () => {
    const target = path.join(tempDir, "nested", "deeper", "saved.pdf");

    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "receipt.pdf",
      target,
    );

    expect(response.isError).toBe(false);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("matches the file name regardless of case", async () => {
    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "  RECEIPT.PDF ",
      tempDir,
    );

    expect(response.isError).toBe(false);
  });

  it("lists what is available when the name does not match", async () => {
    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "invoice.pdf",
      tempDir,
    );

    expect(response.isError).toBe(true);
    expect(response.error).toContain("receipt.pdf");
    expect(
      accountingApi.getBankTransactionAttachmentById,
    ).not.toHaveBeenCalled();
  });

  it("says 'none' when the transaction has no attachments at all", async () => {
    accountingApi.getBankTransactionAttachments.mockResolvedValue({ body: {} });

    const response = await getXeroBankTransactionAttachment(
      TRANSACTION_ID,
      "receipt.pdf",
      tempDir,
    );

    expect(response.isError).toBe(true);
    expect(response.error).toContain("none");
  });
});
