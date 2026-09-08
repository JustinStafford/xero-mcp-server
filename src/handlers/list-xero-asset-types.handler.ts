import { AssetType } from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * List asset types, which carry the default depreciation settings and the
 * account codes new assets of that type post to.
 */
export async function listXeroAssetTypes(): Promise<
  XeroClientResponse<AssetType[]>
> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.getAssetTypes(
      xeroClient.tenantId,
      getClientHeaders(),
    );

    return {
      result: response.body ?? [],
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
