import {
  AssetType,
  BookDepreciationSetting,
} from "../../types/assets-types.js";
import { z } from "zod";

import { createXeroAssetType } from "../../handlers/create-xero-asset-type.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const CreateAssetTypeTool = CreateXeroTool(
  "create-asset-type",
  "Create a fixed asset type, which supplies depreciation defaults and the accounts \
assets of that type post to. \
The three account fields take account IDs (GUIDs), not account codes — call \
list-accounts for the SAME organisation to find them. Account IDs from another \
organisation will not work.",
  {
    assetTypeName: z.string().describe("Name of the asset type, e.g. 'Motor Vehicles'"),
    fixedAssetAccountId: z
      .string()
      .optional()
      .describe("Account ID (GUID) of the fixed asset account, from list-accounts"),
    depreciationExpenseAccountId: z
      .string()
      .optional()
      .describe("Account ID (GUID) of the depreciation expense account"),
    accumulatedDepreciationAccountId: z
      .string()
      .optional()
      .describe("Account ID (GUID) of the accumulated depreciation account"),
    depreciationMethod: z
      .enum([
        "NoDepreciation",
        "StraightLine",
        "DiminishingValue100",
        "DiminishingValue150",
        "DiminishingValue200",
        "FullDepreciation",
      ])
      .describe("Depreciation method for assets of this type"),
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
    const bookDepreciationSetting: BookDepreciationSetting = {
      depreciationMethod:
        args.depreciationMethod as unknown as BookDepreciationSetting.DepreciationMethodEnum,
    };
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

    const assetType: AssetType = {
      assetTypeName: args.assetTypeName,
      fixedAssetAccountId: args.fixedAssetAccountId,
      depreciationExpenseAccountId: args.depreciationExpenseAccountId,
      accumulatedDepreciationAccountId: args.accumulatedDepreciationAccountId,
      bookDepreciationSetting,
    };

    const response = await createXeroAssetType(assetType);

    if (response.isError) {
      return {
        content: [
          { type: "text" as const, text: `Error creating asset type: ${response.error}` },
        ],
      };
    }

    const created = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Asset type created: ${created.assetTypeName}`,
            `  Asset type ID: ${created.assetTypeId}`,
            created.bookDepreciationSetting?.depreciationMethod
              ? `  Method: ${created.bookDepreciationSetting.depreciationMethod}`
              : null,
            created.bookDepreciationSetting?.depreciationRate !== undefined
              ? `  Rate: ${created.bookDepreciationSetting.depreciationRate}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default CreateAssetTypeTool;
