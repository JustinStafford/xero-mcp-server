import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { getXeroAssetSettings } from "../../handlers/get-xero-asset-settings.handler.js";
import { formatXeroDate } from "../../helpers/format-date.js";

const GetAssetSettingsTool = CreateXeroTool(
  "get-asset-settings",
  "Get an organisation's fixed asset register settings: the asset number sequence, the \
register start date, and the default accounts used on disposal. \
Check this before registering an asset — registration fails if the start date is not \
configured, and Xero's error does not explain why.",
  {},
  async () => {
    const response = await getXeroAssetSettings();

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching asset settings: ${response.error}`,
          },
        ],
      };
    }

    const settings = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Fixed asset settings:",
            settings.assetStartDate
              ? `  Register start date: ${formatXeroDate(settings.assetStartDate)}`
              : "  Register start date: NOT SET — registering assets will fail",
            settings.lastDepreciationDate
              ? `  Last depreciation run: ${formatXeroDate(settings.lastDepreciationDate)}`
              : "  Last depreciation run: never",
            settings.assetNumberPrefix
              ? `  Asset number prefix: ${settings.assetNumberPrefix}`
              : null,
            settings.assetNumberSequence
              ? `  Next asset number: ${settings.assetNumberSequence}`
              : null,
            settings.defaultGainOnDisposalAccountId
              ? `  Gain on disposal account ID: ${settings.defaultGainOnDisposalAccountId}`
              : null,
            settings.defaultLossOnDisposalAccountId
              ? `  Loss on disposal account ID: ${settings.defaultLossOnDisposalAccountId}`
              : null,
            settings.defaultCapitalGainOnDisposalAccountId
              ? `  Capital gain on disposal account ID: ${settings.defaultCapitalGainOnDisposalAccountId}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetAssetSettingsTool;
