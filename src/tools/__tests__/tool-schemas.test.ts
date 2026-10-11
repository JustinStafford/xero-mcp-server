import { z } from "zod";
import { describe, expect, it } from "vitest";

import { CreateTools } from "../create/index.js";
import { GetTools } from "../get/index.js";
import { ListTools } from "../list/index.js";
import { UpdateTools } from "../update/index.js";
import { MAX_EXPECTED_PAYMENT_DATE_UPDATES } from "../../handlers/set-xero-invoice-expected-payment-date.handler.js";

const allTools = [...GetTools, ...CreateTools, ...ListTools, ...UpdateTools].map(
  (tool) => tool(),
);

/** The Zod object a tool validates its arguments against. */
const schemaFor = (name: string) => {
  const tool = allTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`No tool named ${name} is registered.`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return z.object(tool.schema as any);
};

const accepts = (name: string, args: Record<string, unknown>): boolean =>
  schemaFor(name).safeParse({ organisation: "Blueshift", ...args }).success;

describe("set-invoice-expected-payment-date", () => {
  it("accepts an invoice ID and a date, with no line items", async () => {
    expect(
      accepts("set-invoice-expected-payment-date", {
        updates: [{ invoiceId: "i-1", expectedPaymentDate: "2026-11-30" }],
      }),
    ).toBe(true);
  });

  it("refuses an empty list", () => {
    expect(
      accepts("set-invoice-expected-payment-date", { updates: [] }),
    ).toBe(false);
  });

  it("caps the batch at the same number the handler enforces", () => {
    // Two layers on purpose: the schema stops the agent, the handler stops
    // anything that reaches it another way.
    const entry = { invoiceId: "i-1", expectedPaymentDate: "2026-11-30" };
    expect(
      accepts("set-invoice-expected-payment-date", {
        updates: Array(MAX_EXPECTED_PAYMENT_DATE_UPDATES).fill(entry),
      }),
    ).toBe(true);
    expect(
      accepts("set-invoice-expected-payment-date", {
        updates: Array(MAX_EXPECTED_PAYMENT_DATE_UPDATES + 1).fill(entry),
      }),
    ).toBe(false);
  });

  it("requires both fields on every entry", () => {
    expect(
      accepts("set-invoice-expected-payment-date", {
        updates: [{ invoiceId: "i-1" }],
      }),
    ).toBe(false);
  });
});

describe("list-invoices filters", () => {
  it("accepts the draft-bills query Lauren needs", () => {
    expect(
      accepts("list-invoices", {
        page: 1,
        statuses: ["DRAFT"],
        types: ["ACCPAY"],
      }),
    ).toBe(true);
  });

  it("accepts a date range", () => {
    expect(
      accepts("list-invoices", {
        page: 1,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      }),
    ).toBe(true);
  });

  it("rejects a status or type that is not a Xero value", () => {
    expect(accepts("list-invoices", { page: 1, statuses: ["APPROVED"] })).toBe(
      false,
    );
    expect(accepts("list-invoices", { page: 1, types: ["BILL"] })).toBe(false);
  });
});

describe("contact bank details", () => {
  it.each(["create-contact", "update-contact"])(
    "%s takes both bank fields",
    (name) => {
      const args =
        name === "create-contact" ? { name: "Jakarta Supplies" } : { contactId: "c-1" };

      expect(
        accepts(name, {
          ...args,
          bankAccountDetails: "063000 12345678",
          batchPayments: {
            bankAccountNumber: "063000-12345678",
            bankAccountName: "Jakarta Supplies",
            details: "INV REF 7",
          },
        }),
      ).toBe(true);
    },
  );

  it.each(["create-contact", "update-contact"])(
    "%s rejects a bank reference over 18 characters",
    (name) => {
      const args =
        name === "create-contact" ? { name: "Jakarta Supplies" } : { contactId: "c-1" };

      expect(
        accepts(name, {
          ...args,
          batchPayments: { details: "THIS REFERENCE IS FAR TOO LONG" },
        }),
      ).toBe(false);
    },
  );

  it("no longer requires a name to update a contact", () => {
    // Requiring it is how a call that only meant to add a phone number could
    // rename the contact.
    expect(accepts("update-contact", { contactId: "c-1", phone: "0411" })).toBe(
      true,
    );
  });

  it("still requires a name to create a contact", () => {
    expect(accepts("create-contact", { email: "a@b.example" })).toBe(false);
  });

  it("lets list-contacts ask for the bank details", () => {
    expect(accepts("list-contacts", { page: 1, includeBankDetails: true })).toBe(
      true,
    );
  });
});

describe("currency on bills", () => {
  it("accepts each of the five currencies Blueshift asked for", () => {
    for (const currencyCode of ["AUD", "NZD", "USD", "GBP", "IDR"]) {
      expect(
        accepts("create-invoice", {
          contactId: "c-1",
          type: "ACCPAY",
          lineItems: [
            {
              description: "Hosting",
              quantity: 1,
              unitAmount: 100,
              accountCode: "400",
              taxType: "NONE",
            },
          ],
          currencyCode,
        }),
      ).toBe(true);
    }
  });

  it("leaves the currency optional, so existing calls are unchanged", () => {
    expect(
      accepts("create-invoice", {
        contactId: "c-1",
        type: "ACCPAY",
        lineItems: [
          {
            description: "Hosting",
            quantity: 1,
            unitAmount: 100,
            accountCode: "400",
            taxType: "NONE",
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("attachment tools", () => {
  const attachmentTools = [
    ["add-invoice-attachment", { invoiceNumberOrId: "PO 7781" }],
    ["add-bank-transaction-attachment", { bankTransactionId: "bt-1" }],
  ] as const;

  it.each(attachmentTools)("%s accepts a local path", (name, args) => {
    expect(accepts(name, { ...args, filePath: "/tmp/receipt.pdf" })).toBe(true);
  });

  it.each(attachmentTools)("%s accepts an https link", (name, args) => {
    expect(
      accepts(name, { ...args, fileUrl: "https://example.test/receipt.pdf" }),
    ).toBe(true);
  });

  it.each(attachmentTools)("%s accepts base64 content", (name, args) => {
    // This is the path that makes upload possible from a client that cannot
    // put a file on the server's disk.
    expect(
      accepts(name, { ...args, fileBase64: "JVBER", fileName: "receipt.pdf" }),
    ).toBe(true);
  });

  it.each(attachmentTools)(
    "%s tells the agent all three options exist",
    (name) => {
      const tool = allTools.find((candidate) => candidate.name === name);
      expect(tool?.description).toContain("filePath");
      expect(tool?.description).toContain("fileUrl");
      expect(tool?.description).toContain("fileBase64");
    },
  );
});

describe("leave balances", () => {
  it("takes an employee ID, a name, or the whole payroll", () => {
    expect(accepts("list-payroll-employee-leave-balances", { employeeId: "e-1" })).toBe(
      true,
    );
    expect(
      accepts("list-payroll-employee-leave-balances", { employeeName: "Lauren" }),
    ).toBe(true);
    expect(
      accepts("list-payroll-employee-leave-balances", { allEmployees: true }),
    ).toBe(true);
  });

  it("says in its own description that the whole payroll must be asked for", () => {
    const tool = allTools.find(
      (candidate) => candidate.name === "list-payroll-employee-leave-balances",
    );
    expect(tool?.description).toContain("allEmployees");
  });
});

describe("every organisation-scoped tool", () => {
  it("requires the organisation, so no write can be ambiguous", () => {
    const optional = allTools
      .filter((tool) => tool.name !== "list-tenants")
      .filter(
        (tool) =>
          schemaFor(tool.name).safeParse({ updates: [], page: 1 }).success,
      )
      .map((tool) => tool.name);

    expect(optional).toEqual([]);
  });
});
