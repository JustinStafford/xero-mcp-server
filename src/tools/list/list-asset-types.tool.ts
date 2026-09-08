import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { listXeroAssetTypes } from "../../handlers/list-xero-asset-types.handler.js";

const ListAssetTypesTool = CreateXeroTool(
  "list-asset-types",
  "List the fixed asset types in an organisation, with their depreciation defaults and \
the accounts assets of that type post to. Use this to find the assetTypeId for \
create-asset.",
  {},
  async () => {
    const response = await listXeroAssetTypes();

    if (response.isError) {
      return {
        content: [
          { type: "text" as const, text: `Error listing asset types: ${response.error}` },
        ],
      };
    }

    const assetTypes = response.result ?? [];

    if (assetTypes.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No asset types defined in this organisation.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${assetTypes.length} asset type${assetTypes.length === 1 ? "" : "s"}:`,
        },
        ...assetTypes.map((assetType) => ({
          type: "text" as const,
          text: [
            `${assetType.assetTypeName}`,
            `  Asset type ID: ${assetType.assetTypeId}`,
            assetType.fixedAssetAccountId
              ? `  Fixed asset account ID: ${assetType.fixedAssetAccountId}`
              : null,
            assetType.depreciationExpenseAccountId
              ? `  Depreciation expense account ID: ${assetType.depreciationExpenseAccountId}`
              : null,
            assetType.accumulatedDepreciationAccountId
              ? `  Accumulated depreciation account ID: ${assetType.accumulatedDepreciationAccountId}`
              : null,
            assetType.bookDepreciationSetting?.depreciationMethod
              ? `  Method: ${assetType.bookDepreciationSetting.depreciationMethod}`
              : null,
            assetType.bookDepreciationSetting?.depreciationRate !== undefined
              ? `  Rate: ${assetType.bookDepreciationSetting.depreciationRate}`
              : null,
            assetType.bookDepreciationSetting?.effectiveLifeYears !== undefined
              ? `  Effective life (years): ${assetType.bookDepreciationSetting.effectiveLifeYears}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListAssetTypesTool;
