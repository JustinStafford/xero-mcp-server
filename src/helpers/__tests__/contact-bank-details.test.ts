import { Contact } from "xero-node";
import { describe, expect, it } from "vitest";

import {
  bankAccountDetailsSchema,
  batchPaymentsSchema,
  formatContactBankDetails,
} from "../contact-bank-details.js";

const render = (contact: Contact): string =>
  formatContactBankDetails(contact).join("\n");

describe("formatContactBankDetails", () => {
  it("says plainly when a supplier cannot be paid in a batch", () => {
    // A silent omission reads as a populated field. "Which suppliers are
    // missing bank details?" is the question this has to answer correctly.
    expect(render({ name: "No Bank Pty Ltd" })).toContain(
      "none on file (cannot be included in a batch payment)",
    );
  });

  it("shows the batch details when they are on file", () => {
    const output = render({
      batchPayments: {
        bankAccountName: "Jakarta Supplies",
        bankAccountNumber: "063000-12345678",
        details: "INV REF 7",
      },
    });

    expect(output).toContain("Account Name: Jakarta Supplies");
    expect(output).toContain("Account Number: 063000-12345678");
    expect(output).toContain("Bank Reference: INV REF 7");
    expect(output).not.toContain("none on file");
  });

  it("treats an account number alone as payable", () => {
    expect(render({ batchPayments: { bankAccountNumber: "063000-1" } })).not.toContain(
      "none on file",
    );
  });

  it("treats a bank reference with no account as not payable", () => {
    // A reference with nowhere to send the money is not bank details.
    expect(render({ batchPayments: { details: "INV REF 7" } })).toContain(
      "none on file",
    );
  });

  it("keeps the informational field clearly separate from the batch block", () => {
    const output = render({
      bankAccountDetails: "063000 12345678",
      batchPayments: { bankAccountNumber: "063000-87654321" },
    });

    expect(output).toContain("Bank Account Details (informational): 063000 12345678");
    expect(output).toContain("Account Number: 063000-87654321");
  });

  it("omits the informational line when it is empty", () => {
    expect(render({ batchPayments: { bankAccountNumber: "1" } })).not.toContain(
      "informational",
    );
  });
});

describe("the schemas shared by create-contact and update-contact", () => {
  it("caps the bank reference at 18 characters at the tool boundary", () => {
    // Xero truncates past this, so the agent is stopped before it saves a
    // reference the bank will never see in full.
    expect(
      batchPaymentsSchema.safeParse({ details: "123456789012345678" }).success,
    ).toBe(true);
    expect(
      batchPaymentsSchema.safeParse({ details: "1234567890123456789" }).success,
    ).toBe(false);
  });

  it("accepts a bank block with only some fields filled in", () => {
    expect(
      batchPaymentsSchema.safeParse({ bankAccountNumber: "063000-1" }).success,
    ).toBe(true);
  });

  it("leaves both bank fields optional", () => {
    expect(batchPaymentsSchema.safeParse(undefined).success).toBe(true);
    expect(bankAccountDetailsSchema.safeParse(undefined).success).toBe(true);
  });

  it("warns in its own description that the informational field is not used for payment", () => {
    // The agent reads this text, so it is the thing that stops the wrong field
    // being filled in.
    expect(bankAccountDetailsSchema.description).toContain("NOT used");
  });
});
