import { AssetType } from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * Create an asset type.
 *
 * The account IDs on an asset type are organisation-specific GUIDs, not
 * account codes — look them up with list-accounts for the same organisation.
 */
export async function createXeroAssetType(
  assetType: AssetType,
): Promise<XeroClientResponse<AssetType>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.createAssetType(
      xeroClient.tenantId,
      assetType,
      undefined, // idempotencyKey
      getClientHeaders(),
    );

    if (!response.body) {
      throw new Error("Asset type creation returned no asset type.");
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
