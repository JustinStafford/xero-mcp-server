import { BankTransaction } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { addXeroBankTransactionAttachment } = await import(
  "../add-xero-bank-transaction-attachment.handler.js"
);

const TRANSACTION_ID = "11111111-2222-3333-4444-555555555555";

const pdfBase64 = Buffer.from("%PDF-1.4 a small receipt").toString("base64");

const transaction: BankTransaction = {
  bankTransactionID: TRANSACTION_ID,
  type: BankTransaction.TypeEnum.SPEND,
  date: "2026-03-14",
  total: 412.5,
  reference: "Uber receipts",
  contact: { name: "Uber" },
  lineItems: [],
  bankAccount: {},
};

const givenTransactionExists = (): void => {
  accountingApi.getBankTransaction.mockResolvedValue({
    body: { bankTransactions: [transaction] },
  });
};

const givenUploadSucceeds = (attachmentId = "a-1"): void => {
  accountingApi.createBankTransactionAttachmentByFileName.mockResolvedValue({
    body: {
      attachments: [
        {
          attachmentID: attachmentId,
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
        },
      ],
    },
  });
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("addXeroBankTransactionAttachment", () => {
  it("reads the file back from Xero and reports it verified", async () => {
    // "It uploaded" is what the upload call says. "It is there" needs a read.
    givenTransactionExists();
    givenUploadSucceeds();
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-1", fileName: "receipt.pdf" }] },
    });

    const response = await addXeroBankTransactionAttachment(TRANSACTION_ID, {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(false);
    expect(response.result?.verified).toBe(true);
    expect(response.result?.uploadedBytes).toBe(
      Buffer.from(pdfBase64, "base64").length,
    );
    expect(response.result?.transactionLabel).toContain("Spend money");
    expect(response.result?.transactionLabel).toContain("Uber");
  });

  it("reports unverified rather than success when the read-back does not find it", async () => {
    givenTransactionExists();
    givenUploadSucceeds("a-1");
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-other" }] },
    });

    const response = await addXeroBankTransactionAttachment(TRANSACTION_ID, {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(false);
    expect(response.result?.verified).toBe(false);
  });

  it("names the wrong transaction instead of failing inside the upload", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [] },
    });

    const response = await addXeroBankTransactionAttachment(TRANSACTION_ID, {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain(TRANSACTION_ID);
    expect(
      accountingApi.createBankTransactionAttachmentByFileName,
    ).not.toHaveBeenCalled();
  });

  it("rejects something that is not a transaction ID before calling Xero", async () => {
    const response = await addXeroBankTransactionAttachment("Uber receipts", {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("list-bank-transactions");
    expect(accountingApi.getBankTransaction).not.toHaveBeenCalled();
  });

  it("does not upload when the file cannot be read", async () => {
    givenTransactionExists();

    const response = await addXeroBankTransactionAttachment(TRANSACTION_ID, {});

    expect(response.isError).toBe(true);
    expect(
      accountingApi.createBankTransactionAttachmentByFileName,
    ).not.toHaveBeenCalled();
  });

  it("errors rather than claiming success when Xero returns no attachment", async () => {
    givenTransactionExists();
    accountingApi.createBankTransactionAttachmentByFileName.mockResolvedValue({
      body: { attachments: [] },
    });

    const response = await addXeroBankTransactionAttachment(TRANSACTION_ID, {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(true);
    expect(response.result).toBeNull();
  });

  it("sends the file name and bytes Xero was given", async () => {
    givenTransactionExists();
    givenUploadSucceeds();
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-1" }] },
    });

    await addXeroBankTransactionAttachment(TRANSACTION_ID, {
      fileName: "receipt.pdf",
      fileBase64: pdfBase64,
    });

    const [tenant, id, name, body] =
      accountingApi.createBankTransactionAttachmentByFileName.mock.calls[0];
    expect(tenant).toBe("tenant-under-test");
    expect(id).toBe(TRANSACTION_ID);
    expect(name).toBe("receipt.pdf");
    expect(Buffer.from(body).toString()).toContain("%PDF-1.4");
  });
});
