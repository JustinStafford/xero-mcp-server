import { Contact, Phone } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { createXeroContact } = await import("../create-xero-contact.handler.js");

/** The contact body this handler sent to Xero. */
const sentContact = (): Contact => {
  expect(accountingApi.createContacts).toHaveBeenCalledTimes(1);
  return accountingApi.createContacts.mock.calls[0][1].contacts[0];
};

beforeEach(() => {
  resetMockXeroClient();
  accountingApi.createContacts.mockImplementation(
    async (_tenant: string, payload: { contacts: Contact[] }) => ({
      body: { contacts: [{ ...payload.contacts[0], contactID: "c-new" }] },
    }),
  );
});

describe("createXeroContact", () => {
  it("sets up a payable supplier in one step", async () => {
    // A supplier created complete is indistinguishable from one corrected
    // later, so there is no second call needed before a batch payment.
    const response = await createXeroContact({
      name: "Jakarta Supplies Pty Ltd",
      email: "accounts@jakartasupplies.example",
      phone: "0400 000 000",
      bankAccountDetails: "063000 12345678",
      batchPayments: {
        bankAccountNumber: "063000-12345678",
        bankAccountName: "Jakarta Supplies",
        details: "INV REF 7",
      },
    });

    expect(response.isError).toBe(false);
    expect(sentContact()).toMatchObject({
      name: "Jakarta Supplies Pty Ltd",
      emailAddress: "accounts@jakartasupplies.example",
      bankAccountDetails: "063000 12345678",
      batchPayments: {
        bankAccountNumber: "063000-12345678",
        bankAccountName: "Jakarta Supplies",
        details: "INV REF 7",
      },
    });
    expect(sentContact().phones).toEqual([
      { phoneNumber: "0400 000 000", phoneType: Phone.PhoneTypeEnum.MOBILE },
    ]);
  });

  it("creates a contact with no bank details at all", async () => {
    const response = await createXeroContact({ name: "Plain Pty Ltd" });

    expect(response.isError).toBe(false);
    expect(sentContact().batchPayments).toBeUndefined();
    expect(sentContact().phones).toBeUndefined();
  });

  it("applies the same 18-character bank reference limit as update does", async () => {
    const response = await createXeroContact({
      name: "Jakarta Supplies Pty Ltd",
      batchPayments: { details: "THIS REFERENCE IS FAR TOO LONG" },
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("18");
    expect(accountingApi.createContacts).not.toHaveBeenCalled();
  });

  it("accepts a bank reference of exactly 18 characters", async () => {
    const response = await createXeroContact({
      name: "Jakarta Supplies Pty Ltd",
      batchPayments: { details: "123456789012345678" },
    });

    expect(response.isError).toBe(false);
  });

  it("errors rather than claiming success when Xero returns no contact", async () => {
    accountingApi.createContacts.mockResolvedValue({ body: { contacts: [] } });

    const response = await createXeroContact({ name: "Plain Pty Ltd" });

    expect(response.isError).toBe(true);
    expect(response.result).toBeNull();
  });
});
