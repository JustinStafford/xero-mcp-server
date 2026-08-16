import { z } from "zod";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

import { tenantContext } from "../clients/tenant-context.js";
import { XeroTenant, resolveTenant } from "../clients/tenant-resolver.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { formatError } from "./format-error.js";
import {
  collectAccountCodes,
  validateAccountCodes,
} from "./validate-account-codes.js";

/**
 * The organisation argument added to every organisation-scoped tool.
 *
 * Required rather than optional, and never remembered between calls: a sticky
 * "current organisation" is what allows one entity's context to leak into
 * another entity's writes.
 */
const organisationArg = z
  .string()
  .describe(
    'Required. The Xero organisation this call targets — its name (e.g. "Watagan Homestead") ' +
      "or tenant ID. Call list-tenants for the available organisations. " +
      "Identifiers are organisation-scoped: never reuse an account code, contact ID, " +
      "tracking ID or tax type from one organisation in another.",
  );

interface ToolResult {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Resolve the organisation, then run the handler inside that tenant's context.
 *
 * Handlers keep reading `xeroClient.tenantId` exactly as before; the value they
 * see comes from the async context established here.
 */
const withTenant = <Args extends ZodRawShapeCompat>(
  handler: ToolCallback<Args>,
): ToolCallback<ZodRawShapeCompat> => {
  const wrapped = async (
    args: Record<string, unknown>,
    extra: unknown,
  ): Promise<ToolResult> => {
    const { organisation, ...toolArgs } = args ?? {};

    let tenant: XeroTenant;
    try {
      tenant = await resolveTenant(String(organisation ?? ""));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: formatError(error) }],
      };
    }

    return tenantContext.run({ tenantId: tenant.tenantId }, async () => {
      // Validated inside the tenant context so codes are checked against the
      // organisation being written to, not whichever was resolved last.
      // No-ops when the arguments carry no account codes, so reads are unaffected.
      const codeError = await validateAccountCodes(collectAccountCodes(toolArgs));
      if (codeError) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Organisation: ${tenant.tenantName} (${tenant.tenantId})\n${codeError}`,
            },
          ],
        };
      }

      const invoke = handler as unknown as (
        a: unknown,
        e: unknown,
      ) => Promise<ToolResult>;

      const result = await invoke(toolArgs, extra);

      // State the organisation actually used, not the one requested, so a
      // resolution surprise is visible in the transcript rather than implied.
      return {
        ...result,
        content: [
          {
            type: "text" as const,
            text: `Organisation: ${tenant.tenantName} (${tenant.tenantId})`,
          },
          ...(result?.content ?? []),
        ],
      };
    });
  };

  return wrapped as unknown as ToolCallback<ZodRawShapeCompat>;
};

export const CreateXeroTool =
  <Args extends ZodRawShapeCompat>(
    name: string,
    description: string,
    schema: Args,
    handler: ToolCallback<Args>,
  ): (() => ToolDefinition<ZodRawShapeCompat>) =>
  () => ({
    name: name,
    description: description,
    schema: { ...schema, organisation: organisationArg } as ZodRawShapeCompat,
    handler: withTenant(handler),
  });
