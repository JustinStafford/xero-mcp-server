import {
  Asset,
  AssetPagination,
  AssetStatusQueryParam,
} from "../types/assets-types.js";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface AssetPage {
  items: Asset[];
  pagination?: AssetPagination;
}

/**
 * List fixed assets by status.
 *
 * Status is required by Xero: the register is queried one status at a time,
 * so there is no "all assets" call.
 */
export async function listXeroAssets(
  status: AssetStatusQueryParam,
  page: number = 1,
  pageSize: number = 50,
  orderBy?: "AssetType" | "AssetName" | "AssetNumber" | "PurchaseDate" | "PurchasePrice" | "DisposalDate" | "DisposalPrice",
  sortDirection?: "asc" | "desc",
  filterBy?: string,
): Promise<XeroClientResponse<AssetPage>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.assetApi.getAssets(
      xeroClient.tenantId,
      status,
      page,
      pageSize,
      orderBy,
      sortDirection,
      filterBy,
      getClientHeaders(),
    );

    return {
      result: {
        items: response.body.items ?? [],
        pagination: response.body.pagination,
      },
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
