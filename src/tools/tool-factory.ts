import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { localFilesEnabled } from "../helpers/attachment-access.js";
import { ToolList } from "../types/tool-list.js";
import { CreateTools } from "./create/index.js";
import { DeleteTools } from "./delete/index.js";
import { GetTools } from "./get/index.js";
import { ListTools } from "./list/index.js";
import { UpdateTools } from "./update/index.js";
import CreateAttachmentUploadLinkTool from "./upload/create-attachment-upload-link.tool.js";
import GetAttachmentUploadResultTool from "./upload/get-attachment-upload-result.tool.js";
import { uploadsEnabled } from "../uploads/upload-config.js";

// What MCP clients show and decide approvals from. Tools are already grouped by
// what they do, so the group is what decides.
const READS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const ADDS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
const CHANGES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const GROUPS: Array<[ToolList, ToolAnnotations]> = [
  [DeleteTools, CHANGES],
  [GetTools, READS],
  [CreateTools, ADDS],
  [ListTools, READS],
  [UpdateTools, CHANGES],
];

/** With local files on, saving an attachment can overwrite a file on this machine. */
const writesToDisk = (name: string): boolean =>
  localFilesEnabled() && /^get-.*-attachment$/.test(name);

/** Only offered where upload links are switched on, so no client is told about a dead end. */
export const UploadLinkTools = {
  create: [CreateAttachmentUploadLinkTool] as ToolList,
  get: [GetAttachmentUploadResultTool] as ToolList,
};

const groups = (): Array<[ToolList, ToolAnnotations]> =>
  uploadsEnabled()
    ? [...GROUPS, [UploadLinkTools.create, ADDS], [UploadLinkTools.get, READS]]
    : GROUPS;

export function ToolFactory(server: McpServer) {
  for (const [tools, annotations] of groups()) {
    for (const tool of tools.map((create) => create())) {
      server.tool(
        tool.name,
        tool.description,
        tool.schema,
        writesToDisk(tool.name) ? CHANGES : annotations,
        tool.handler,
      );
    }
  }
}
