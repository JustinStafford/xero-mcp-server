import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Stated once here rather than repeated across ~50 tool descriptions. These
 * are the rules that are not recoverable from any single tool's schema.
 */
const INSTRUCTIONS = `This server reaches multiple Xero organisations through one connection.

Organisations
- Every tool except list-tenants requires an \`organisation\` argument.
- Call list-tenants first to discover the available organisation names.
- There is no "current" organisation. Each call states its own target, and the
  organisation actually used is reported at the top of every response.

Identifiers do not cross organisations
- Account codes, contact IDs, tracking option IDs and tax types are specific to
  one organisation. A code that means one thing in one organisation may mean
  something entirely different, or nothing, in another.
- When moving data between organisations, look up the destination organisation's
  own values first (for example list-accounts) before writing. Never carry an
  identifier read from one organisation into a write against another.

Writes
- Manual journals are created as DRAFT unless a status is explicitly requested.
  Review the draft in Xero before posting it.`;

export class XeroMcpServer {
  private static instance: McpServer | null = null;

  private constructor() {}

  public static GetServer(): McpServer {
    if (XeroMcpServer.instance === null) {
      XeroMcpServer.instance = new McpServer(
        {
          name: "Xero MCP Server",
          version: "1.0.0",
        },
        { instructions: INSTRUCTIONS },
      );
    }
    return XeroMcpServer.instance;
  }
}
