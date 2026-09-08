import { z } from "zod";

import { getXeroAsset } from "../../handlers/get-xero-asset.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const GetAssetTool = CreateXeroTool(
  "get-asset",
  "Get a single fixed asset in full, including its depreciation settings and \
accumulated depreciation. Use list-assets to find the asset ID.",
  {
    assetId: z.string().describe("The Xero identifier of the asset"),
  },
  async ({ assetId }) => {
    const response = await getXeroAsset(assetId);

    if (response.isError) {
      return {
        content: [
          { type: "text" as const, text: `Error fetching asset: ${response.error}` },
        ],
      };
    }

    const asset = response.result;
    const setting = asset.bookDepreciationSetting;
    const detail = asset.bookDepreciationDetail;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${asset.assetName}${asset.assetNumber ? ` (${asset.assetNumber})` : ""}`,
            `  Asset ID: ${asset.assetId}`,
            `  Status: ${asset.assetStatus}`,
            asset.assetTypeId ? `  Asset type ID: ${asset.assetTypeId}` : null,
            asset.purchaseDate ? `  Purchased: ${formatXeroDate(asset.purchaseDate)}` : null,
            asset.purchasePrice !== undefined
              ? `  Purchase price: ${asset.purchasePrice}`
              : null,
            asset.accountingBookValue !== undefined
              ? `  Book value: ${asset.accountingBookValue}`
              : null,
            asset.serialNumber ? `  Serial: ${asset.serialNumber}` : null,
            asset.warrantyExpiryDate
              ? `  Warranty expires: ${formatXeroDate(asset.warrantyExpiryDate)}`
              : null,
            asset.disposalDate ? `  Disposed: ${formatXeroDate(asset.disposalDate)}` : null,
            asset.disposalPrice !== undefined
              ? `  Disposal price: ${asset.disposalPrice}`
              : null,
            setting ? "" : null,
            setting ? "Depreciation settings:" : null,
            setting?.depreciationMethod ? `  Method: ${setting.depreciationMethod}` : null,
            setting?.averagingMethod ? `  Averaging: ${setting.averagingMethod}` : null,
            setting?.depreciationRate !== undefined
              ? `  Rate: ${setting.depreciationRate}`
              : null,
            setting?.effectiveLifeYears !== undefined
              ? `  Effective life (years): ${setting.effectiveLifeYears}`
              : null,
            detail ? "" : null,
            detail ? "Depreciation detail:" : null,
            detail?.depreciationStartDate
              ? `  Start date: ${formatXeroDate(detail.depreciationStartDate)}`
              : null,
            detail?.priorAccumDepreciationAmount !== undefined
              ? `  Prior accumulated: ${detail.priorAccumDepreciationAmount}`
              : null,
            detail?.currentAccumDepreciationAmount !== undefined
              ? `  Current accumulated: ${detail.currentAccumDepreciationAmount}`
              : null,
            detail?.costLimit !== undefined ? `  Cost limit: ${detail.costLimit}` : null,
            detail?.residualValue !== undefined
              ? `  Residual value: ${detail.residualValue}`
              : null,
            detail?.currentGainLoss !== undefined
              ? `  Current gain/loss: ${detail.currentGainLoss}`
              : null,
            "",
            // Surfaced because Xero reports these but offers no API to act on
            // them — both are Xero UI operations.
            `Rollback available in Xero: ${asset.canRollback ? "yes" : "no"}`,
            "Note: disposal, depreciation runs, edits and rollbacks are not available \
through the Xero API and must be done in Xero.",
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetAssetTool;
