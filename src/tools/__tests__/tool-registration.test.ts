import { describe, expect, it } from "vitest";

import { CreateTools } from "../create/index.js";
import { DeleteTools } from "../delete/index.js";
import { GetTools } from "../get/index.js";
import { ListTools } from "../list/index.js";
import { UpdateTools } from "../update/index.js";

const allTools = [
  ...DeleteTools,
  ...GetTools,
  ...CreateTools,
  ...ListTools,
  ...UpdateTools,
].map((tool) => tool());

describe("registered tools", () => {
  it("have unique names", () => {
    const names = allTools.map((tool) => tool.name);
    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("all carry the organisation argument, so no call is ambiguous", () => {
    const missing = allTools
      .filter((tool) => tool.name !== "list-tenants")
      .filter((tool) => !("organisation" in tool.schema))
      .map((tool) => tool.name);

    expect(missing).toEqual([]);
  });

  it("include the tools added for Blueshift", () => {
    const names = allTools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "get-invoice",
        "list-currencies",
        "set-invoice-expected-payment-date",
        "list-payroll-employee-leave-balances",
        "add-bank-transaction-attachment",
        "list-bank-transaction-attachments",
        "get-bank-transaction-attachment",
      ]),
    );
  });

  it("do not expose batch payments", () => {
    // Deliberately out of scope: the Xero API cannot produce the ABA file, and a
    // batch payment is AUTHORISED on creation and cannot be deleted through the
    // API. The implementation is in git history at eeef9ea if it is revived.
    const batchTools = allTools
      .map((tool) => tool.name)
      .filter((name) => name.includes("batch-payment"));

    expect(batchTools).toEqual([]);
  });
});
