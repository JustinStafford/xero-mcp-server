import { Address, Contact, Phone } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { updateXeroContact } = await import("../update-xero-contact.handler.js");

/** The contact already on file. Anything not named in a call must survive it. */
const storedContact = (overrides: Partial<Contact> = {}): Contact => ({
  contactID: "c-1",
  name: "Jakarta Supplies Pty Ltd",
  emailAddress: "accounts@jakartasupplies.example",
  phones: [
    { phoneType: Phone.PhoneTypeEnum.DEFAULT, phoneNumber: "03 9000 0000" },
    { phoneType: Phone.PhoneTypeEnum.MOBILE, phoneNumber: "0400 000 000" },
  ],
  addresses: [
    {
      addressType: Address.AddressTypeEnum.STREET,
      addressLine1: "1 Old Street",
      city: "Melbourne",
    },
    {
      addressType: Address.AddressTypeEnum.POBOX,
      addressLine1: "PO Box 99",
      city: "Melbourne",
    },
  ],
  batchPayments: {
    bankAccountNumber: "063000-12345678",
    bankAccountName: "Jakarta Supplies",
    details: "INV REF 7",
  },
  ...overrides,
});

/** The contact body this handler sent to Xero on the single update call. */
const sentContact = (): Contact => {
  expect(accountingApi.updateContact).toHaveBeenCalledTimes(1);
  const [, , contacts] = accountingApi.updateContact.mock.calls[0];
  return contacts.contacts[0];
};

const givenStoredContact = (contact: Contact = storedContact()): void => {
  accountingApi.getContact.mockResolvedValue({ body: { contacts: [contact] } });
  accountingApi.updateContact.mockImplementation(
    async (_tenant: string, _id: string, contacts: { contacts: Contact[] }) => ({
      body: { contacts: [{ ...contact, ...contacts.contacts[0] }] },
    }),
  );
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("updateXeroContact", () => {
  it("keeps the stored name when the call does not supply one", async () => {
    // The bug this guards: adding a phone number used to be able to rename the
    // contact, because `name` was required on every call.
    givenStoredContact();

    const response = await updateXeroContact({
      contactId: "c-1",
      phone: "0411 111 111",
    });

    expect(response.isError).toBe(false);
    expect(sentContact().name).toBe("Jakarta Supplies Pty Ltd");
  });

  it("renames only when a new name is supplied explicitly", async () => {
    givenStoredContact();

    await updateXeroContact({ contactId: "c-1", name: "Jakarta Supplies Ltd" });

    expect(sentContact().name).toBe("Jakarta Supplies Ltd");
  });

  it("does not send fields the call never mentioned", async () => {
    // A field present but empty is how Xero gets told to blank it.
    givenStoredContact();

    await updateXeroContact({ contactId: "c-1", phone: "0411 111 111" });

    const contact = sentContact();
    expect(contact).not.toHaveProperty("emailAddress");
    expect(contact).not.toHaveProperty("firstName");
    expect(contact).not.toHaveProperty("bankAccountDetails");
    expect(contact).not.toHaveProperty("addresses");
  });

  it("replaces the mobile number and keeps the other phone types", async () => {
    givenStoredContact();

    await updateXeroContact({ contactId: "c-1", phone: "0411 111 111" });

    expect(sentContact().phones).toEqual([
      { phoneType: Phone.PhoneTypeEnum.DEFAULT, phoneNumber: "03 9000 0000" },
      { phoneType: Phone.PhoneTypeEnum.MOBILE, phoneNumber: "0411 111 111" },
    ]);
  });

  it("replaces the street address and keeps the PO box", async () => {
    givenStoredContact();

    await updateXeroContact({
      contactId: "c-1",
      address: { addressLine1: "2 New Street", city: "Sydney" },
    });

    const addresses = sentContact().addresses ?? [];
    expect(addresses).toHaveLength(2);
    expect(addresses[0]).toMatchObject({
      addressType: Address.AddressTypeEnum.POBOX,
      addressLine1: "PO Box 99",
    });
    expect(addresses[1]).toMatchObject({
      addressType: Address.AddressTypeEnum.STREET,
      addressLine1: "2 New Street",
      city: "Sydney",
    });
  });

  it("merges bank details field by field rather than replacing the block", async () => {
    // This block is what the ABA export reads. Clearing the bank reference
    // while correcting an account number would send a payment with no
    // reference on it.
    givenStoredContact();

    await updateXeroContact({
      contactId: "c-1",
      batchPayments: { bankAccountNumber: "063000-87654321" },
    });

    expect(sentContact().batchPayments).toEqual({
      bankAccountNumber: "063000-87654321",
      bankAccountName: "Jakarta Supplies",
      details: "INV REF 7",
    });
  });

  it("adds bank details to a contact that has none", async () => {
    givenStoredContact(storedContact({ batchPayments: undefined }));

    await updateXeroContact({
      contactId: "c-1",
      batchPayments: {
        bankAccountNumber: "063000-11112222",
        bankAccountName: "New Supplier",
        details: "REF 1",
      },
    });

    expect(sentContact().batchPayments).toEqual({
      bankAccountNumber: "063000-11112222",
      bankAccountName: "New Supplier",
      details: "REF 1",
    });
  });

  it("stores the informational bank field separately from the batch block", async () => {
    givenStoredContact();

    await updateXeroContact({
      contactId: "c-1",
      bankAccountDetails: "063000 12345678",
    });

    const contact = sentContact();
    expect(contact.bankAccountDetails).toBe("063000 12345678");
    expect(contact).not.toHaveProperty("batchPayments");
  });

  it("rejects a bank reference over 18 characters without writing anything", async () => {
    givenStoredContact();

    const response = await updateXeroContact({
      contactId: "c-1",
      batchPayments: { details: "THIS REFERENCE IS FAR TOO LONG" },
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("18");
    expect(accountingApi.updateContact).not.toHaveBeenCalled();
  });

  it("accepts a bank reference of exactly 18 characters", async () => {
    givenStoredContact();

    const response = await updateXeroContact({
      contactId: "c-1",
      batchPayments: { details: "123456789012345678" },
    });

    expect(response.isError).toBe(false);
    expect(sentContact().batchPayments?.details).toBe("123456789012345678");
  });

  it("names the missing contact and does not write when the ID is unknown", async () => {
    accountingApi.getContact.mockResolvedValue({ body: { contacts: [] } });

    const response = await updateXeroContact({ contactId: "c-missing" });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("c-missing");
    expect(accountingApi.updateContact).not.toHaveBeenCalled();
  });

  it("reports a Xero failure as an error rather than a silent success", async () => {
    accountingApi.getContact.mockResolvedValue({
      body: { contacts: [storedContact()] },
    });
    accountingApi.updateContact.mockResolvedValue({ body: { contacts: [] } });

    const response = await updateXeroContact({ contactId: "c-1", phone: "0411" });

    expect(response.isError).toBe(true);
    expect(response.result).toBeNull();
  });
});
