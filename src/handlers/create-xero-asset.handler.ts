import { Asset } from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Create a fixed asset.
 *
 * Xero has no endpoint to update, delete, dispose or depreciate an asset, so
 * this is a one-way door for anything registered: a DRAFT asset can still be
 * removed in the Xero UI, whereas a REGISTERED one begins depreciating.
 */
export async function createXeroAsset(
  asset: Asset,
): Promise<XeroClientResponse<Asset>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.createAsset(
      xeroClient.tenantId,
      asset,
      undefined, // idempotencyKey
      getClientHeaders(),
    );

    if (!response.body) {
      throw new Error("Asset creation returned no asset.");
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
