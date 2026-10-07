import { describe, expect, it } from "vitest";

import { dateRangeClauses, isIsoDate, joinWhere, toXeroDateTime } from "../xero-where.js";

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-11-30")).toBe(true);
  });

  it("rejects a date that does not exist", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(isIsoDate("30/11/2026")).toBe(false);
    expect(isIsoDate("2026-11-30T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("toXeroDateTime", () => {
  it("renders the DateTime form Xero's where clause expects", () => {
    expect(toXeroDateTime("2026-01-05", "dateFrom")).toBe("DateTime(2026,01,05)");
  });

  it("names the offending argument when the date is unusable", () => {
    expect(() => toXeroDateTime("5 Jan", "dateFrom")).toThrowError(/dateFrom/);
  });
});

describe("dateRangeClauses", () => {
  it("builds both ends of the range against the named field", () => {
    expect(dateRangeClauses("Date", "2026-01-01", "2026-01-31")).toEqual([
      "Date>=DateTime(2026,01,01)",
      "Date<=DateTime(2026,01,31)",
    ]);
  });

  it("builds nothing when no dates are given", () => {
    expect(dateRangeClauses("Date")).toEqual([]);
  });
});

describe("joinWhere", () => {
  it("returns undefined rather than an empty filter", () => {
    expect(joinWhere([])).toBeUndefined();
  });

  it("joins clauses with AND", () => {
    expect(joinWhere(['Type=="ACCPAY"', "Date>=DateTime(2026,01,01)"])).toBe(
      'Type=="ACCPAY" AND Date>=DateTime(2026,01,01)',
    );
  });
});
