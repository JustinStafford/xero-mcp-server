#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XeroMcpServer } from "./server/xero-mcp-server.js";
import { ToolFactory } from "./tools/tool-factory.js";
import { formatError } from "./helpers/format-error.js";
import { getXeroClient } from "./clients/xero-client.js";

const main = async () => {
  // Fail fast on missing credentials, rather than on the first tool call.
  getXeroClient();

  // Create an MCP server
  const server = XeroMcpServer.GetServer();

  ToolFactory(server);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Error:", formatError(error));
  process.exit(1);
});
