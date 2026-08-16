import { z } from "zod";

import { listXeroTenants } from "../../handlers/list-xero-tenants.handler.js";
import { CreateGlobalTool } from "../../helpers/create-global-tool.js";

const ListTenantsTool = CreateGlobalTool(
  "list-tenants",
  "List the Xero organisations this server can access, with their names and tenant IDs. \
Call this first to discover the organisation names to pass as the `organisation` argument \
of every other tool. This is the only tool that does not require an organisation.",
  {
    refresh: z
      .boolean()
      .optional()
      .describe(
        "Optional. Bypass the cache and re-read the connection list from Xero. \
Use after authorising a new organisation.",
      ),
  },
  async ({ refresh }) => {
    const response = await listXeroTenants(refresh ?? false);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing organisations: ${response.error}`,
          },
        ],
      };
    }

    const tenants = response.result ?? [];

    if (tenants.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No organisations are connected. Run `npm run authorise` to connect one.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Found ${tenants.length} connected organisation${tenants.length === 1 ? "" : "s"}:`,
            "",
            ...tenants.map((tenant) =>
              [
                `${tenant.tenantName}`,
                `  Tenant ID: ${tenant.tenantId}`,
                `  Type: ${tenant.tenantType}`,
              ].join("\n"),
            ),
          ].join("\n"),
        },
      ],
    };
  },
);

export default ListTenantsTool;
