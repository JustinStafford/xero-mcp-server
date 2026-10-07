import { Currency, CurrencyCode } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

/** The currencies an organisation has actually enabled in Xero. */
export const getEnabledCurrencies = async (): Promise<Currency[]> => {
  const response = await xeroClient.accountingApi.getCurrencies(
    xeroClient.tenantId,
    undefined, // where
    "Code ASC", // order
    getClientHeaders(),
  );

  return response.body.currencies ?? [];
};

/** Turn a three-letter code into the SDK enum, or say which codes are valid. */
export const parseCurrencyCode = (code: string): CurrencyCode => {
  const normalised = (code ?? "").trim().toUpperCase();
  const parsed = CurrencyCode[normalised as keyof typeof CurrencyCode];

  if (parsed === undefined) {
    throw new Error(
      `"${code}" is not a currency code Xero recognises. Use a three-letter ISO code, ` +
        "for example AUD, NZD, USD, GBP or IDR.",
    );
  }

  return parsed;
};

/**
 * Reject a currency the organisation has not enabled, before sending it.
 *
 * Xero's own validation error for this does not name the currency or say what
 * to do, and adding a currency to an organisation is a Xero settings change
 * rather than something this server should do on its own.
 */
export const assertCurrencyEnabled = async (
  code: CurrencyCode,
): Promise<void> => {
  const enabled = await getEnabledCurrencies();

  if (enabled.some((currency) => currency.code === code)) {
    return;
  }

  const available = enabled
    .map((currency) => currency.code)
    .filter(Boolean)
    .join(", ");

  throw new Error(
    `This organisation has not enabled ${code}. Add it in Xero under ` +
      "Settings > Advanced settings > Currencies first, then try again. " +
      `Currently enabled: ${available || "none"}.`,
  );
};
