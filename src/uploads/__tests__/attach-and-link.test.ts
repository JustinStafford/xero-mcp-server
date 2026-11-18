import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { Invoice } from "xero-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
  xeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { tenantContext } = await import("../../clients/tenant-context.js");
const { attachUpload, sha256Hex } = await import("../attach-upload.js");
const { setListenerProblem, UploadLinks } = await import("../upload-links.js");
const { createXeroAttachmentUploadLink, getXeroAttachmentUploadLink } =
  await import("../../handlers/create-xero-attachment-upload-link.handler.js");
const { ToolFactory } = await import("../../tools/tool-factory.js");
const { serverInstructions } = await import("../../server/xero-mcp-server.js");

const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TXN_ID = "11111111-2222-3333-4444-555555555555";
const PDF = Buffer.from("%PDF-1.7 the original bill");

const bill: Invoice = {
  invoiceID: INVOICE_ID,
  invoiceNumber: "INV-0322",
  type: Invoice.TypeEnum.ACCPAY,
  status: Invoice.StatusEnum.DRAFT,
  contact: { name: "Watagon" },
};

/** The mock reads the tenant the way the real client does: from the call's context. */
const followTenantContext = () =>
  Object.defineProperty(xeroClient, "tenantId", {
    configurable: true,
    get: () => tenantContext.getStore()?.tenantId ?? "no-tenant",
  });

const enableUploads = () => {
  vi.stubEnv("XERO_UPLOAD_PORT", "8011");
  vi.stubEnv("XERO_UPLOAD_URL", "https://mcp.example.com/xero-upload");
  setListenerProblem(null);
};

beforeEach(() => {
  resetMockXeroClient();
  followTenantContext();
  accountingApi.getInvoice.mockResolvedValue({ body: { invoices: [bill] } });
  accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [bill] } });
  accountingApi.getInvoiceAttachments.mockResolvedValue({
    body: { attachments: [{ attachmentID: "att-1", fileName: "old.pdf" }] },
  });
  accountingApi.createInvoiceAttachmentByFileName.mockResolvedValue({
    body: {
      attachments: [
        { attachmentID: "att-1", fileName: "bill.pdf", mimeType: "application/pdf" },
      ],
    },
  });
  accountingApi.getInvoiceAttachmentById.mockResolvedValue({ body: PDF });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(xeroClient, "tenantId", {
    configurable: true,
    writable: true,
    value: "tenant-under-test",
  });
});

describe("attaching an uploaded file", () => {
  const linkFor = (tenantId: string) =>
    new UploadLinks(600_000).create(tenantId, "Watagan Homestead", {
      kind: "invoice",
      id: INVOICE_ID,
      label: "Bill INV-0322",
      includeOnline: false,
    });

  it("sends the original bytes to the link's own organisation and record", async () => {
    const outcome = await attachUpload(
      linkFor("tenant-of-the-link"),
      { body: PDF, name: "bill.pdf" },
      "application/pdf",
    );

    const [tenantId, invoiceId, name, body, includeOnline] =
      accountingApi.createInvoiceAttachmentByFileName.mock.calls[0];
    expect(tenantId).toBe("tenant-of-the-link");
    expect(invoiceId).toBe(INVOICE_ID);
    expect(name).toBe("bill.pdf");
    expect(Buffer.compare(body, PDF)).toBe(0);
    expect(includeOnline).toBe(false);

    expect(outcome).toEqual({
      fileName: "bill.pdf",
      bytes: PDF.length,
      sha256: sha256Hex(PDF),
      mimeType: "application/pdf",
      storedOnRecord: true,
      contentMatches: true,
    });
  });

  it("reads the file back from Xero and says when it differs", async () => {
    accountingApi.getInvoiceAttachmentById.mockResolvedValue({
      body: Buffer.from("%PDF-1.7 a damaged bill"),
    });

    const outcome = await attachUpload(
      linkFor("t1"),
      { body: PDF, name: "bill.pdf" },
      "application/pdf",
    );

    expect(accountingApi.getInvoiceAttachmentById.mock.calls[0].slice(0, 3)).toEqual([
      "t1",
      INVOICE_ID,
      "att-1",
    ]);
    expect(outcome.contentMatches).toBe(false);
  });

  it("claims nothing when the file can't be read back", async () => {
    accountingApi.getInvoiceAttachmentById.mockRejectedValue(new Error("boom"));

    const outcome = await attachUpload(
      linkFor("t1"),
      { body: PDF, name: "bill.pdf" },
      "application/pdf",
    );

    expect(outcome.storedOnRecord).toBe(true);
    expect(outcome.contentMatches).toBeNull();
  });

  it("fails when Xero refuses the upload", async () => {
    accountingApi.createInvoiceAttachmentByFileName.mockRejectedValue(
      new Error("Attachment too large"),
    );

    await expect(
      attachUpload(linkFor("t1"), { body: PDF, name: "bill.pdf" }, "application/pdf"),
    ).rejects.toThrowError(/Attachment too large/);
  });

  it("attaches to a bank transaction", async () => {
    accountingApi.getBankTransaction.mockResolvedValue({
      body: { bankTransactions: [{ bankTransactionID: TXN_ID }] },
    });
    accountingApi.createBankTransactionAttachmentByFileName.mockResolvedValue({
      body: { attachments: [{ attachmentID: "att-9", fileName: "r.pdf" }] },
    });
    accountingApi.getBankTransactionAttachments.mockResolvedValue({
      body: { attachments: [{ attachmentID: "att-9" }] },
    });
    accountingApi.getBankTransactionAttachmentById.mockResolvedValue({ body: PDF });

    const link = new UploadLinks(600_000).create("t1", "Org", {
      kind: "bank-transaction",
      id: TXN_ID,
      label: "Spend money",
      includeOnline: false,
    });
    const outcome = await attachUpload(link, { body: PDF, name: "r.pdf" }, "application/pdf");

    expect(
      accountingApi.createBankTransactionAttachmentByFileName.mock.calls[0].slice(0, 3),
    ).toEqual(["t1", TXN_ID, "r.pdf"]);
    expect(outcome.contentMatches).toBe(true);
  });
});

describe("creating an upload link", () => {
  const inTenant = <T>(tenantId: string, fn: () => Promise<T> | T) =>
    tenantContext.run({ tenantId, tenantName: `Org ${tenantId}` }, fn);

  it("is refused where upload links are off", async () => {
    vi.stubEnv("XERO_UPLOAD_PORT", "");
    vi.stubEnv("XERO_UPLOAD_URL", "");

    const response = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-0322"),
    );

    expect(response.error).toMatch(/aren't switched on/);
    expect(accountingApi.getInvoices).not.toHaveBeenCalled();
  });

  it("is refused, with the reason, when the listener isn't running", async () => {
    enableUploads();
    setListenerProblem("The upload listener failed: EADDRINUSE");

    const response = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-0322"),
    );

    expect(response.error).toMatch(/EADDRINUSE.*fileBase64/);
  });

  it("binds the link to the organisation and the resolved record", async () => {
    enableUploads();

    const response = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-0322"),
    );

    expect(response.isError).toBe(false);
    const { link, url, alreadyAttached } = response.result!;
    expect(link).toMatchObject({
      tenantId: "t1",
      tenantName: "Org t1",
      status: "open",
      target: { kind: "invoice", id: INVOICE_ID, includeOnline: false },
    });
    expect(link.target.label).toContain("INV-0322");
    expect(url).toBe(`https://mcp.example.com/xero-upload/${link.token}`);
    expect(alreadyAttached).toEqual(["old.pdf"]);
  });

  it("is refused when the record doesn't exist in that organisation", async () => {
    enableUploads();
    accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });

    const response = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-9999"),
    );

    expect(response.error).toMatch(/No invoice or bill numbered/);
  });

  it("is refused when the record already has ten attachments", async () => {
    enableUploads();
    accountingApi.getInvoiceAttachments.mockResolvedValue({
      body: {
        attachments: Array.from({ length: 10 }, (_, i) => ({ fileName: `${i}.pdf` })),
      },
    });

    const response = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-0322"),
    );

    expect(response.error).toMatch(/already has 10 attachments/);
  });

  it("can only be read back from the organisation it was made in", async () => {
    enableUploads();
    const created = await inTenant("t1", () =>
      createXeroAttachmentUploadLink("invoice", "INV-0322"),
    );
    const id = created.result!.link.id;

    expect(inTenant("t1", () => getXeroAttachmentUploadLink(id))).toMatchObject({
      isError: false,
    });
    expect(inTenant("t2", () => getXeroAttachmentUploadLink(id))).toMatchObject({
      isError: true,
    });
  });
});

describe("upload link tools", () => {
  const registered = () => {
    const tools: Array<{ name: string; annotations: ToolAnnotations; schema: object }> = [];
    ToolFactory({
      tool: (name: string, _d: string, schema: object, annotations: ToolAnnotations) => {
        tools.push({ name, annotations, schema });
      },
    } as unknown as McpServer);
    return tools;
  };

  it("aren't offered where upload links are off", () => {
    vi.stubEnv("XERO_UPLOAD_PORT", "");
    vi.stubEnv("XERO_UPLOAD_URL", "");

    expect(registered().map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["create-attachment-upload-link"]),
    );
    expect(serverInstructions()).not.toMatch(/upload-link/);
  });

  it("are offered, annotated and organisation-scoped where they are on", () => {
    enableUploads();
    const tools = registered();
    const create = tools.find((t) => t.name === "create-attachment-upload-link");
    const get = tools.find((t) => t.name === "get-attachment-upload-result");

    expect(create?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(get?.annotations.readOnlyHint).toBe(true);
    expect(create?.schema).toHaveProperty("organisation");
    expect(get?.schema).toHaveProperty("organisation");
    // No way for a tool argument to name a path or a link.
    expect(Object.keys(create!.schema).sort()).toEqual([
      "attachTo",
      "includeOnline",
      "organisation",
      "recordId",
    ]);
    expect(serverInstructions()).toMatch(/create-attachment-upload-link/);
  });
});
