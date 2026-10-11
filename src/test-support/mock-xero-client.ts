import { vi } from "vitest";

/**
 * A stand-in for the real Xero client, so handler logic can be tested without
 * a Xero organisation.
 *
 * The real `clients/xero-client.js` throws at import time when the Xero
 * credentials are absent, so every handler test replaces the whole module:
 *
 *     vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());
 */
export const accountingApi = {
  getContact: vi.fn(),
  updateContact: vi.fn(),
  createContacts: vi.fn(),
  getContacts: vi.fn(),
  getInvoice: vi.fn(),
  getInvoices: vi.fn(),
  updateInvoice: vi.fn(),
  createInvoices: vi.fn(),
  updateOrCreateInvoices: vi.fn(),
  getCurrencies: vi.fn(),
  getBankTransaction: vi.fn(),
  createBankTransactionAttachmentByFileName: vi.fn(),
  getBankTransactionAttachments: vi.fn(),
  getBankTransactionAttachmentById: vi.fn(),
  createInvoiceAttachmentByFileName: vi.fn(),
  getInvoiceAttachments: vi.fn(),
  getInvoiceAttachmentById: vi.fn(),
};

export const payrollAUApi = {
  getEmployee: vi.fn(),
  getEmployees: vi.fn(),
};

export const xeroClient = {
  tenantId: "tenant-under-test",
  authenticate: vi.fn(),
  /** Used to build deep links back into the Xero web interface. */
  getShortCode: vi.fn(),
  accountingApi,
  payrollAUApi,
};

/** The module shape `vi.mock` has to return in place of the real client. */
export const mockXeroClientModule = () => ({ xeroClient });

/** Clear call history and queued results between tests. */
export const resetMockXeroClient = (): void => {
  for (const api of [accountingApi, payrollAUApi]) {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
  }
  xeroClient.authenticate.mockReset();
  xeroClient.authenticate.mockResolvedValue(undefined);
  xeroClient.getShortCode.mockReset();
  xeroClient.getShortCode.mockResolvedValue("!shortcode");
  xeroClient.tenantId = "tenant-under-test";
};
