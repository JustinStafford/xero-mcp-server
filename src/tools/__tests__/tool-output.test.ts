import { BankTransaction, Contact, CurrencyCode, Invoice } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  payrollAUApi,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());
vi.mock("../../clients/tenant-resolver.js", () => ({
  resolveTenant: async () => ({
    tenantId: "tenant-under-test",
    tenantName: "Blueshift",
    tenantType: "ORGANISATION",
  }),
  listTenants: async () => [],
}));

const { CreateTools } = await import("../create/index.js");
const { GetTools } = await import("../get/index.js");
const { ListTools } = await import("../list/index.js");
const { UpdateTools } = await import("../update/index.js");

const allTools = [...GetTools, ...CreateTools, ...ListTools, ...UpdateTools].map(
  (tool) => tool(),
);

/** Run a tool end to end and flatten its response to plain text. */
const run = async (
  name: string,
  args: Record<string, unknown>,
): Promise<string> => {
  const tool = allTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`No tool named ${name} is registered.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await (tool.handler as any)(
    { organisation: "Blueshift", ...args },
    {},
  );

  return (result.content ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("\n");
};

const TRANSACTION_ID = "11111111-2222-3333-4444-555555555555";
const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  resetMockXeroClient();
});

describe("every tool states the organisation it used", () => {
  it("puts it ahead of the result, not implied by the request", async () => {
    accountingApi.getCurrencies.mockResolvedValue({
      body: { currencies: [{ code: CurrencyCode.AUD }] },
    });

    const text = await run("list-currencies", {});

    expect(text).toContain("Organisation: Blueshift (tenant-under-test)");
  });
});

describe("list-currencies", () => {
  it("lists what the organisation accepts", async () => {
    accountingApi.getCurrencies.mockResolvedValue({
      body: {
        currencies: [
          { code: CurrencyCode.AUD, description: "Australian Dollar" },
          { code: CurrencyCode.IDR, description: "Indonesian Rupiah" },
        ],
      },
    });

    const text = await run("list-currencies", {});

    expect(text).toContain("AUD");
    expect(text).toContain("IDR");
  });

  it("reports a failure as an error", async () => {
    accountingApi.getCurrencies.mockRejectedValue(new Error("no access"));

    const text = await run("list-currencies", {});

    expect(text.toLowerCase()).toContain("error");
  });
});

describe("set-invoice-expected-payment-date", () => {
  const authorised: Invoice = {
    invoiceID: "i-1",
    invoiceNumber: "INV-0042",
    type: Invoice.TypeEnum.ACCREC,
    status: Invoice.StatusEnum.AUTHORISED,
    amountDue: 1650,
  };

  it("reports how many of how many were updated", async () => {
    accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [authorised] } });
    accountingApi.updateOrCreateInvoices.mockResolvedValue({
      body: {
        invoices: [
          { ...authorised, expectedPaymentDate: "2026-11-30" },
        ],
      },
    });

    const text = await run("set-invoice-expected-payment-date", {
      updates: [{ invoiceId: "i-1", expectedPaymentDate: "2026-11-30" }],
    });

    expect(text).toContain("1 of 1 invoice updated.");
    expect(text).toContain("INV-0042 → 2026-11-30");
  });

  it("names each invoice it did not update and why", async () => {
    accountingApi.getInvoices.mockResolvedValue({
      body: {
        invoices: [
          { ...authorised, invoiceID: "i-paid", status: Invoice.StatusEnum.PAID },
        ],
      },
    });

    const text = await run("set-invoice-expected-payment-date", {
      updates: [{ invoiceId: "i-paid", expectedPaymentDate: "2026-11-30" }],
    });

    expect(text).toContain("0 of 1 invoice updated.");
    expect(text).toContain("Not updated:");
    expect(text).toContain("AUTHORISED");
  });

  it("reports an outright failure as an error", async () => {
    accountingApi.getInvoices.mockRejectedValue(new Error("network down"));

    const text = await run("set-invoice-expected-payment-date", {
      updates: [{ invoiceId: "i-1", expectedPaymentDate: "2026-11-30" }],
    });

    expect(text).toContain("Error setting expected payment date");
  });
});

describe("list-contacts", () => {
  it("says which suppliers cannot be paid in a batch", async () => {
    // This is the precondition for any batch payment run, and the answer has
    // to be unambiguous when the details are absent.
    const contacts: Contact[] = [
      {
        contactID: "c-1",
        name: "Jakarta Supplies Pty Ltd",
        batchPayments: {
          bankAccountNumber: "063000-12345678",
          bankAccountName: "Jakarta Supplies",
        },
      },
      { contactID: "c-2", name: "No Bank Pty Ltd" },
    ];
    accountingApi.getContacts.mockResolvedValue({ body: { contacts } });

    const text = await run("list-contacts", { page: 1, includeBankDetails: true });

    expect(text).toContain("063000-12345678");
    expect(text).toContain("none on file");
  });

  it("reports a failure as an error", async () => {
    accountingApi.getContacts.mockRejectedValue(new Error("no access"));

    const text = await run("list-contacts", { page: 1 });

    expect(text.toLowerCase()).toContain("error");
  });
});

describe("get-invoice", () => {
  it("renders the invoice and its line items", async () => {
    accountingApi.getInvoice.mockResolvedValue({
      body: {
        invoices: [
          {
            invoiceID: INVOICE_ID,
            invoiceNumber: "PO 7781",
            type: Invoice.TypeEnum.ACCPAY,
            status: Invoice.StatusEnum.DRAFT,
            contact: { name: "Jakarta Supplies Pty Ltd" },
            lineItems: [
              {
                description: "Hosting, March",
                quantity: 1,
                unitAmount: 100,
                accountCode: "400",
              },
            ],
          },
        ],
      },
    });

    const text = await run("get-invoice", { invoiceNumberOrId: INVOICE_ID });

    expect(text).toContain("PO 7781");
    expect(text).toContain("Hosting, March");
  });

  it("reports a missing invoice as an error", async () => {
    accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [] } });

    const text = await run("get-invoice", { invoiceNumberOrId: INVOICE_ID });

    expect(text.toLowerCase()).toContain("error");
  });
});

describe("list-invoices", () => {
  it("renders a filtered list", async () => {
    accountingApi.getInvoices.mockResolvedValue({
      body: {
        invoices: [
          {
            invoiceID: "i-1",
            invoiceNumber: "PO 7781",
            type: Invoice.TypeEnum.ACCPAY,
            status: Invoice.StatusEnum.DRAFT,
            contact: { name: "Jakarta Supplies Pty Ltd" },
          },
        ],
      },
    });

    const text = await run("list-invoices", {
      page: 1,
      statuses: ["DRAFT"],
      types: ["ACCPAY"],
    });

    expect(text).toContain("PO 7781");
  });

  it("reports a bad date as an error rather than the wrong invoices", async () => {
    const text = await run("list-invoices", { page: 1, dateFrom: "01/03/2026" });

    expect(text.toLowerCase()).toContain("error");
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });
});

describe("list-payroll-employee-leave-balances", () => {
  it("renders an employee's leave", async () => {
    payrollAUApi.getEmployee.mockResolvedValue({
      body: {
        employees: [
          {
            employeeID: "e-1",
            firstName: "Lauren",
            lastName: "Smith",
            dateOfBirth: "1990-01-01",
            leaveBalances: [
              {
                leaveName: "Annual Leave",
                leaveTypeID: "lt-1",
                numberOfUnits: 76,
                typeOfUnits: "Hours",
              },
            ],
          },
        ],
      },
    });

    const text = await run("list-payroll-employee-leave-balances", {
      employeeId: "e-1",
    });

    expect(text).toContain("Lauren Smith");
    expect(text).toContain("Annual Leave");
    expect(text).toContain("76");
  });

  it("reports a refused query as an error", async () => {
    const text = await run("list-payroll-employee-leave-balances", {});

    expect(text.toLowerCase()).toContain("error");
  });
});

describe("bank transaction attachments", () => {
  const transaction: BankTransaction = {
    bankTransactionID: TRANSACTION_ID,
    type: BankTransaction.TypeEnum.SPEND,
    date: "2026-03-14",
    total: 412.5,
    contact: { name: "Uber" },
    lineItems: [],
    bankAccount: {},
  };

  it("confirms an upload was read back from Xero", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.createBankTransactionAttachmentByFileName.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-1", fileName: "receipt.pdf" }] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-1", fileName: "receipt.pdf" }] },
    });

    const text = await run("add-bank-transaction-attachment", {
      bankTransactionId: TRANSACTION_ID,
      fileName: "receipt.pdf",
      fileBase64: Buffer.from("%PDF-1.4").toString("base64"),
    });

    expect(text).toContain("receipt.pdf");
    expect(text).toContain("Spend money");
  });

  it("lists the files on a transaction", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: {
        attachments: [
          { attachmentID: "a-1", fileName: "receipt.pdf", mimeType: "application/pdf" },
        ],
      },
    });

    const text = await run("list-bank-transaction-attachments", {
      bankTransactionId: TRANSACTION_ID,
    });

    expect(text).toContain("receipt.pdf");
  });

  it("says plainly when a transaction has no attachments", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [transaction] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({ body: {} });

    const text = await run("list-bank-transaction-attachments", {
      bankTransactionId: TRANSACTION_ID,
    });

    expect(text.toLowerCase()).toMatch(/no attachment|none/);
  });

  it("reports a bad transaction ID as an error", async () => {
    const text = await run("list-bank-transaction-attachments", {
      bankTransactionId: "Uber receipts",
    });

    expect(text.toLowerCase()).toContain("error");
  });
});

describe("contact writes", () => {
  it("creates a supplier with bank details and echoes them back", async () => {
    accountingApi.createContacts.mockImplementation(
      async (_tenant: string, payload: { contacts: Contact[] }) => ({
        body: { contacts: [{ ...payload.contacts[0], contactID: "c-new" }] },
      }),
    );

    const text = await run("create-contact", {
      name: "Jakarta Supplies Pty Ltd",
      batchPayments: {
        bankAccountNumber: "063000-12345678",
        bankAccountName: "Jakarta Supplies",
      },
    });

    expect(text).toContain("Jakarta Supplies Pty Ltd");
  });

  it("reports a rejected bank reference as an error", async () => {
    const text = await run("update-contact", {
      contactId: "c-1",
      batchPayments: { bankAccountName: "X" },
    });

    // No stored contact, so the read fails and nothing is written.
    expect(text.toLowerCase()).toContain("error");
    expect(accountingApi.updateContact).not.toHaveBeenCalled();
  });
});
