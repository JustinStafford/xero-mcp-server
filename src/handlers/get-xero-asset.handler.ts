import { Asset } from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Get one fixed asset, including its depreciation detail.
 */
export async function getXeroAsset(
  assetId: string,
): Promise<XeroClientResponse<Asset>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.getAssetById(
      xeroClient.tenantId,
      assetId,
      getClientHeaders(),
    );

    if (!response.body) {
      throw new Error(`Asset ${assetId} was not found.`);
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
