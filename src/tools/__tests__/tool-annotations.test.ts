import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolFactory } from "../tool-factory.js";

/** Every tool as ToolFactory registers it. */
const registered = (): Array<{ name: string; annotations: ToolAnnotations }> => {
  const tools: Array<{ name: string; annotations: ToolAnnotations }> = [];
  ToolFactory({
    tool: (name: string, _d: string, _s: unknown, annotations: ToolAnnotations) => {
      tools.push({ name, annotations });
    },
  } as unknown as McpServer);
  return tools;
};

const prefixOf = (name: string) => name.split("-")[0];

describe("tool annotations", () => {
  beforeEach(() => {
    vi.stubEnv("XERO_LOCAL_FILES", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are on every tool", () => {
    const missing = registered()
      .filter(({ annotations }) => annotations?.readOnlyHint === undefined)
      .map(({ name }) => name);

    expect(missing).toEqual([]);
  });

  it("mark list- and get- tools read-only", () => {
    const wrong = registered()
      .filter(({ name }) => ["list", "get"].includes(prefixOf(name)))
      .filter(({ annotations }) => annotations.readOnlyHint !== true)
      .map(({ name }) => name);

    expect(wrong).toEqual([]);
  });

  it("mark create- and add- tools as writing but not destructive", () => {
    const wrong = registered()
      .filter(({ name }) => ["create", "add"].includes(prefixOf(name)))
      .filter(
        ({ annotations }) =>
          annotations.readOnlyHint !== false ||
          annotations.destructiveHint !== false,
      )
      .map(({ name }) => name);

    expect(wrong).toEqual([]);
  });

  it("mark update- and set- tools destructive", () => {
    const wrong = registered()
      .filter(({ name }) => ["update", "set"].includes(prefixOf(name)))
      .filter(
        ({ annotations }) =>
          annotations.readOnlyHint !== false ||
          annotations.destructiveHint !== true,
      )
      .map(({ name }) => name);

    expect(wrong).toEqual([]);
  });

  it("leave no tool with a name those rules don't cover", () => {
    const unknown = registered()
      .map(({ name }) => name)
      .filter(
        (name) =>
          !["list", "get", "create", "add", "update", "set"].includes(
            prefixOf(name),
          ),
      );

    expect(unknown).toEqual([]);
  });

  it("stop calling attachment downloads read-only once they can overwrite a file", () => {
    vi.stubEnv("XERO_LOCAL_FILES", "1");

    const downloads = registered().filter(({ name }) =>
      /^get-.*-attachment$/.test(name),
    );

    expect(downloads.length).toBeGreaterThan(0);
    for (const { annotations } of downloads) {
      expect(annotations.readOnlyHint).toBe(false);
      expect(annotations.destructiveHint).toBe(true);
    }
  });
});

describe("attachment tools on a hosted server", () => {
  const loadTools = async () => {
    const { CreateTools } = await import("../create/index.js");
    const { GetTools } = await import("../get/index.js");
    return [...CreateTools, ...GetTools].map((create) => create());
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("XERO_LOCAL_FILES", "");
    vi.stubEnv("XERO_FILE_URLS", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    "add-invoice-attachment",
    "add-bank-transaction-attachment",
    "get-invoice-attachment",
    "get-bank-transaction-attachment",
  ])("%s offers no path or link", async (name) => {
    const tool = (await loadTools()).find((candidate) => candidate.name === name);

    expect(tool).toBeDefined();
    const offered = Object.keys(tool!.schema as object);
    expect(offered).not.toContain("filePath");
    expect(offered).not.toContain("fileUrl");
    expect(offered).not.toContain("outputPath");
    expect(tool!.description).not.toContain("filePath");
    expect(tool!.description).not.toContain("fileUrl");
    expect(tool!.description).not.toContain("outputPath");
  });
});
