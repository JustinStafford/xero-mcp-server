import { AssetStatusQueryParam } from "../../types/assets-types.js";
import { z } from "zod";

import { listXeroAssets } from "../../handlers/list-xero-assets.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const ListAssetsTool = CreateXeroTool(
  "list-assets",
  "List fixed assets in an organisation's asset register. Status is required — Xero \
queries the register one status at a time, so there is no way to list every asset in a \
single call. REGISTERED assets are depreciating; DRAFT assets are not yet in the \
register; DISPOSED assets have been sold or written off.",
  {
    status: z
      .enum(["DRAFT", "REGISTERED", "DISPOSED"])
      .describe("Which part of the register to list"),
    page: z.number().optional().describe("Page number, defaults to 1"),
    pageSize: z.number().optional().describe("Assets per page, defaults to 50"),
    orderBy: z
      .enum([
        "AssetType",
        "AssetName",
        "AssetNumber",
        "PurchaseDate",
        "PurchasePrice",
        "DisposalDate",
        "DisposalPrice",
      ])
      .optional()
      .describe("Field to sort by"),
    sortDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    filterBy: z
      .string()
      .optional()
      .describe("Optional text filter applied to asset name and number"),
  },
  async ({ status, page, pageSize, orderBy, sortDirection, filterBy }) => {
    const response = await listXeroAssets(
      status as unknown as AssetStatusQueryParam,
      page ?? 1,
      pageSize ?? 50,
      orderBy,
      sortDirection,
      filterBy,
    );

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing assets: ${response.error}`,
          },
        ],
      };
    }

    const { items, pagination } = response.result;

    if (items.length === 0) {
      return {
        content: [
          { type: "text" as const, text: `No ${status} assets in this organisation.` },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${items.length} ${status} asset${items.length === 1 ? "" : "s"}${
            pagination
              ? ` (page ${pagination.page} of ${pagination.pageCount}, ${pagination.itemCount} total)`
              : ""
          }:`,
        },
        ...items.map((asset) => ({
          type: "text" as const,
          text: [
            `${asset.assetName}${asset.assetNumber ? ` (${asset.assetNumber})` : ""}`,
            `  Asset ID: ${asset.assetId}`,
            asset.purchaseDate
              ? `  Purchased: ${formatXeroDate(asset.purchaseDate)}`
              : null,
            asset.purchasePrice !== undefined
              ? `  Purchase price: ${asset.purchasePrice}`
              : null,
            asset.accountingBookValue !== undefined
              ? `  Book value: ${asset.accountingBookValue}`
              : null,
            asset.bookDepreciationDetail?.currentAccumDepreciationAmount !== undefined
              ? `  Accumulated depreciation: ${asset.bookDepreciationDetail.currentAccumDepreciationAmount}`
              : null,
            asset.disposalDate ? `  Disposed: ${formatXeroDate(asset.disposalDate)}` : null,
            asset.disposalPrice !== undefined
              ? `  Disposal price: ${asset.disposalPrice}`
              : null,
            asset.serialNumber ? `  Serial: ${asset.serialNumber}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListAssetsTool;
