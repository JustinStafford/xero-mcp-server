import { AssetSetting } from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Get the organisation's fixed asset settings.
 *
 * Worth checking before registering an asset: if the register's start date is
 * not configured, Xero rejects registered assets with an error that does not
 * explain why.
 */
export async function getXeroAssetSettings(): Promise<
  XeroClientResponse<AssetSetting>
> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.getAssetSettings(
      xeroClient.tenantId,
      getClientHeaders(),
    );

    if (!response.body) {
      throw new Error("No asset settings returned.");
    }

    return {
      result: response.body,
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
