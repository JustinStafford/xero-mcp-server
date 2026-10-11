import { Invoice } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { addXeroInvoiceAttachment } = await import(
  "../add-xero-invoice-attachment.handler.js"
);

const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const pdfBase64 = Buffer.from("%PDF-1.4 a supplier invoice").toString("base64");

const bill: Invoice = {
  invoiceID: INVOICE_ID,
  invoiceNumber: "PO 7781",
  type: Invoice.TypeEnum.ACCPAY,
  status: Invoice.StatusEnum.DRAFT,
  contact: { name: "Jakarta Supplies Pty Ltd" },
};

const givenUploadSucceeds = (attachmentId = "a-1"): void => {
  accountingApi.createInvoiceAttachmentByFileName.mockResolvedValue({
    body: {
      attachments: [
        {
          attachmentID: attachmentId,
          fileName: "supplier-invoice.pdf",
          mimeType: "application/pdf",
        },
      ],
    },
  });
  accountingApi.getInvoiceAttachments.mockResolvedValue({
    body: { attachments: [{ attachmentID: attachmentId }] },
  });
};

beforeEach(() => {
  resetMockXeroClient();
  accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [bill] } });
  accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [bill] } });
});

describe("addXeroInvoiceAttachment", () => {
  it("accepts base64 content, which is what a hosted server can be sent", async () => {
    // The original tool only read from the server's own disk. A remote client
    // has no path it can name there, so this is the path that makes it usable.
    givenUploadSucceeds();

    const response = await addXeroInvoiceAttachment(INVOICE_ID, {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(false);
    expect(response.result?.verified).toBe(true);
    expect(response.result?.uploadedBytes).toBe(
      Buffer.from(pdfBase64, "base64").length,
    );
    expect(response.result?.invoiceLabel).toBe(
      "Bill PO 7781 (Jakarta Supplies Pty Ltd) [DRAFT]",
    );
  });

  it("finds the bill by its number as well as by its ID", async () => {
    givenUploadSucceeds();

    const response = await addXeroInvoiceAttachment("PO 7781", {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(false);
    expect(accountingApi.createInvoiceAttachmentByFileName.mock.calls[0][1]).toBe(
      INVOICE_ID,
    );
  });

  it("refuses to guess when an invoice number matches more than one record", async () => {
    // Attaching a supplier document to the wrong bill is not obviously wrong
    // after the fact.
    accountingApi.getInvoices.mockResolvedValue({
      body: { invoices: [bill, { ...bill, invoiceID: "other" }] },
    });

    const response = await addXeroInvoiceAttachment("PO 7781", {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("matches 2 invoices");
    expect(
      accountingApi.createInvoiceAttachmentByFileName,
    ).not.toHaveBeenCalled();
  });

  it("reports unverified rather than success when the read-back does not find it", async () => {
    givenUploadSucceeds("a-1");
    accountingApi.getInvoiceAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "a-other" }] },
    });

    const response = await addXeroInvoiceAttachment(INVOICE_ID, {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.result?.verified).toBe(false);
  });

  it("does not upload when the file cannot be read", async () => {
    const response = await addXeroInvoiceAttachment(INVOICE_ID, {});

    expect(response.isError).toBe(true);
    expect(
      accountingApi.createInvoiceAttachmentByFileName,
    ).not.toHaveBeenCalled();
  });

  it("keeps the attachment off the emailed invoice unless asked", async () => {
    givenUploadSucceeds();

    await addXeroInvoiceAttachment(INVOICE_ID, {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(accountingApi.createInvoiceAttachmentByFileName.mock.calls[0][4]).toBe(
      false,
    );
  });

  it("puts the attachment on the emailed invoice when asked", async () => {
    givenUploadSucceeds();

    await addXeroInvoiceAttachment(
      INVOICE_ID,
      { fileName: "supplier-invoice.pdf", fileBase64: pdfBase64 },
      true,
    );

    expect(accountingApi.createInvoiceAttachmentByFileName.mock.calls[0][4]).toBe(
      true,
    );
  });

  it("names the missing bill rather than failing inside the upload", async () => {
    accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [] } });

    const response = await addXeroInvoiceAttachment(INVOICE_ID, {
      fileName: "supplier-invoice.pdf",
      fileBase64: pdfBase64,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain(INVOICE_ID);
  });
});
