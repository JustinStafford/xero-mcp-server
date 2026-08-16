import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

import { ToolDefinition } from "../types/tool-definition.js";

/**
 * Creates a tool that is NOT scoped to a single organisation.
 *
 * `CreateXeroTool` injects a required `organisation` argument into every tool
 * it builds. That is correct for anything touching organisation data, but a
 * tool whose job is to *discover* the organisations cannot require one — it
 * would be unusable until you already knew the answer.
 *
 * Reserve this for tools that genuinely span all organisations. Anything that
 * reads or writes organisation data must use `CreateXeroTool`.
 */
export const CreateGlobalTool =
  <Args extends ZodRawShapeCompat>(
    name: string,
    description: string,
    schema: Args,
    handler: ToolCallback<Args>,
  ): (() => ToolDefinition<ZodRawShapeCompat>) =>
  () => ({
    name: name,
    description: description,
    schema: schema as ZodRawShapeCompat,
    handler: handler as ToolCallback<ZodRawShapeCompat>,
  });
