import { Currency } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getEnabledCurrencies } from "../helpers/resolve-currency.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * List the currencies an organisation has enabled.
 */
export async function listXeroCurrencies(): Promise<
  XeroClientResponse<Currency[]>
> {
  try {
    await xeroClient.authenticate();

    return {
      result: await getEnabledCurrencies(),
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
