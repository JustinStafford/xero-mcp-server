import { CurrencyCode } from "xero-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accountingApi,
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { assertCurrencyEnabled, getEnabledCurrencies, parseCurrencyCode } =
  await import("../resolve-currency.js");

const givenEnabled = (codes: CurrencyCode[]): void => {
  accountingApi.getCurrencies.mockResolvedValue({
    body: { currencies: codes.map((code) => ({ code, description: code })) },
  });
};

beforeEach(() => {
  resetMockXeroClient();
});

describe("parseCurrencyCode", () => {
  it.each(["AUD", "NZD", "USD", "GBP", "IDR"])(
    "recognises %s, the five currencies Blueshift asked for",
    (code) => {
      expect(parseCurrencyCode(code)).toBe(
        CurrencyCode[code as keyof typeof CurrencyCode],
      );
    },
  );

  it.each(["aud", " aud ", "Aud"])("normalises %s", (code) => {
    expect(parseCurrencyCode(code)).toBe(CurrencyCode.AUD);
  });

  it.each(["AUDD", "ZZZ", "", "   ", "dollars"])(
    "rejects %s and names the valid codes",
    (code) => {
      expect(() => parseCurrencyCode(code)).toThrowError(/three-letter ISO/);
    },
  );
});

describe("assertCurrencyEnabled", () => {
  it("passes a currency the organisation has enabled", async () => {
    givenEnabled([CurrencyCode.AUD, CurrencyCode.IDR]);

    await expect(
      assertCurrencyEnabled(CurrencyCode.IDR),
    ).resolves.toBeUndefined();
  });

  it("names the currency and where to add it when it is not enabled", async () => {
    // Xero's own error for this does not name the currency or say what to do,
    // and adding one is a settings change this server deliberately will not make.
    givenEnabled([CurrencyCode.AUD, CurrencyCode.NZD]);

    await expect(assertCurrencyEnabled(CurrencyCode.IDR)).rejects.toThrowError(
      /has not enabled IDR/,
    );
    await expect(assertCurrencyEnabled(CurrencyCode.IDR)).rejects.toThrowError(
      /Settings > Advanced settings > Currencies/,
    );
  });

  it("lists what is enabled so the next call can be right", async () => {
    givenEnabled([CurrencyCode.AUD, CurrencyCode.NZD]);

    await expect(assertCurrencyEnabled(CurrencyCode.IDR)).rejects.toThrowError(
      /Currently enabled: AUD, NZD/,
    );
  });

  it("copes with an organisation that has no currencies listed", async () => {
    accountingApi.getCurrencies.mockResolvedValue({ body: {} });

    await expect(assertCurrencyEnabled(CurrencyCode.AUD)).rejects.toThrowError(
      /Currently enabled: none/,
    );
  });
});

describe("getEnabledCurrencies", () => {
  it("returns an empty list rather than undefined", async () => {
    accountingApi.getCurrencies.mockResolvedValue({ body: {} });

    await expect(getEnabledCurrencies()).resolves.toEqual([]);
  });
});
