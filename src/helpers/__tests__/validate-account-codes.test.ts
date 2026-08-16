import { describe, it, expect } from "vitest";
import { collectAccountCodes } from "../validate-account-codes.js";

describe("collectAccountCodes", () => {
  it("finds codes in journal lines", () => {
    expect(
      collectAccountCodes({
        narration: "Gross up",
        manualJournalLines: [
          { accountCode: "200", lineAmount: 100 },
          { accountCode: "477", lineAmount: -100 },
        ],
      }),
    ).toEqual(["200", "477"]);
  });

  it("finds codes in invoice line items", () => {
    expect(
      collectAccountCodes({
        lineItems: [{ accountCode: "200" }, { accountCode: "260" }],
      }),
    ).toEqual(["200", "260"]);
  });

  it("finds codes nested in item sales and purchase details", () => {
    expect(
      collectAccountCodes({
        salesDetails: { accountCode: "200" },
        purchaseDetails: { accountCode: "300" },
      }),
    ).toEqual(["200", "300"]);
  });

  it("trims surrounding whitespace", () => {
    expect(collectAccountCodes({ lineItems: [{ accountCode: "  200 " }] })).toEqual(["200"]);
  });

  it("ignores empty and non-string codes", () => {
    expect(
      collectAccountCodes({
        lineItems: [
          { accountCode: "" },
          { accountCode: "   " },
          { accountCode: 200 },
          { accountCode: null },
        ],
      }),
    ).toEqual([]);
  });

  it("returns nothing for arguments without account codes", () => {
    expect(collectAccountCodes({ page: 1, contactIds: ["abc"] })).toEqual([]);
  });

  it("handles primitives and null safely", () => {
    expect(collectAccountCodes(null)).toEqual([]);
    expect(collectAccountCodes("200")).toEqual([]);
    expect(collectAccountCodes(undefined)).toEqual([]);
  });

  it("does not recurse without bound", () => {
    // Deeply nested input must terminate rather than blow the stack.
    let deep: Record<string, unknown> = { accountCode: "999" };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    expect(() => collectAccountCodes(deep)).not.toThrow();
    expect(collectAccountCodes(deep)).toEqual([]);
  });
});
