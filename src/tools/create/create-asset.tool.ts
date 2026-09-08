import {
  Asset,
  AssetStatus,
  BookDepreciationSetting,
} from "../../types/assets-types.js";
import { z } from "zod";

import { createXeroAsset } from "../../handlers/create-xero-asset.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const CreateAssetTool = CreateXeroTool(
  "create-asset",
  "Create a fixed asset in an organisation's asset register. \
Defaults to DRAFT, which is almost always what you want: a draft asset can still be \
removed in Xero, whereas a REGISTERED asset starts depreciating and posts to the \
balance sheet. Xero provides no API to edit, delete, dispose or depreciate an asset \
afterwards, so registering one here cannot be undone through this server. \
Check get-asset-settings first — registering fails if the organisation's fixed asset \
start date is not configured.",
  {
    assetName: z.string().describe("Name of the asset"),
    assetTypeId: z
      .string()
      .optional()
      .describe(
        "Asset type ID, which supplies the depreciation defaults and account codes. \
Use list-asset-types for this organisation to find it.",
      ),
    assetNumber: z
      .string()
      .optional()
      .describe("Optional asset number. Xero generates one if omitted."),
    purchaseDate: z.string().optional().describe("Purchase date in YYYY-MM-DD format"),
    purchasePrice: z.number().optional().describe("Purchase price"),
    serialNumber: z.string().optional().describe("Optional serial number"),
    warrantyExpiryDate: z
      .string()
      .optional()
      .describe("Optional warranty expiry date in YYYY-MM-DD format"),
    assetStatus: z
      .enum(["Draft", "Registered"])
      .optional()
      .describe(
        "Defaults to Draft. Only pass Registered when the user has explicitly asked for \
the asset to be registered — it begins depreciating and cannot be undone via the API.",
      ),
    depreciationMethod: z
      .enum([
        "NoDepreciation",
        "StraightLine",
        "DiminishingValue100",
        "DiminishingValue150",
        "DiminishingValue200",
        "FullDepreciation",
      ])
      .optional()
      .describe("Depreciation method. Inherited from the asset type if omitted."),
    averagingMethod: z
      .enum(["FullMonth", "ActualDays"])
      .optional()
      .describe("Averaging method for the first period"),
    depreciationRate: z
      .number()
      .optional()
      .describe("Depreciation rate, e.g. 0.2 for 20% per year"),
    effectiveLifeYears: z
      .number()
      .optional()
      .describe("Effective life in years, as an alternative to a rate"),
  },
  async (args) => {
    const bookDepreciationSetting: BookDepreciationSetting = {};
    if (args.depreciationMethod !== undefined) {
      bookDepreciationSetting.depreciationMethod =
        args.depreciationMethod as unknown as BookDepreciationSetting.DepreciationMethodEnum;
    }
    if (args.averagingMethod !== undefined) {
      bookDepreciationSetting.averagingMethod =
        args.averagingMethod as unknown as BookDepreciationSetting.AveragingMethodEnum;
    }
    if (args.depreciationRate !== undefined) {
      bookDepreciationSetting.depreciationRate = args.depreciationRate;
    }
    if (args.effectiveLifeYears !== undefined) {
      bookDepreciationSetting.effectiveLifeYears = args.effectiveLifeYears;
    }

    const asset: Asset = {
      assetName: args.assetName,
      assetTypeId: args.assetTypeId,
      assetNumber: args.assetNumber,
      purchaseDate: args.purchaseDate,
      purchasePrice: args.purchasePrice,
      serialNumber: args.serialNumber,
      warrantyExpiryDate: args.warrantyExpiryDate,
      // Draft unless explicitly registered — registering is irreversible here.
      assetStatus: (args.assetStatus ?? "Draft") as unknown as AssetStatus,
    };

    if (Object.keys(bookDepreciationSetting).length > 0) {
      asset.bookDepreciationSetting = bookDepreciationSetting;
    }

    const response = await createXeroAsset(asset);

    if (response.isError) {
      return {
        content: [
          { type: "text" as const, text: `Error creating asset: ${response.error}` },
        ],
      };
    }

    const created = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Asset created: ${created.assetName}`,
            `  Asset ID: ${created.assetId}`,
            created.assetNumber ? `  Asset number: ${created.assetNumber}` : null,
            `  Status: ${created.assetStatus}`,
            created.purchaseDate
              ? `  Purchased: ${formatXeroDate(created.purchaseDate)}`
              : null,
            created.purchasePrice !== undefined
              ? `  Purchase price: ${created.purchasePrice}`
              : null,
            String(created.assetStatus) === "Draft"
              ? "  Draft — not yet depreciating. Register it in Xero when ready."
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default CreateAssetTool;
