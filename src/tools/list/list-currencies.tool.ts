import { listXeroCurrencies } from "../../handlers/list-xero-currencies.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const ListCurrenciesTool = CreateXeroTool(
  "list-currencies",
  "List the currencies an organisation has enabled in Xero. A bill or invoice can only \
use a currency that appears here. Adding a new currency is a settings change made in \
Xero itself, not through this server.",
  {},
  async () => {
    const response = await listXeroCurrencies();

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing currencies: ${response.error}`,
          },
        ],
      };
    }

    const currencies = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `${currencies.length} currenc${currencies.length === 1 ? "y" : "ies"} enabled:`,
            ...currencies.map(
              (currency) =>
                `  ${currency.code}${currency.description ? ` — ${currency.description}` : ""}`,
            ),
          ].join("\n"),
        },
      ],
    };
  },
);

export default ListCurrenciesTool;
