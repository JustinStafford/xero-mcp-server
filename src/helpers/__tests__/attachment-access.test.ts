import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deliverAttachment,
  deliveredAttachmentContent,
} from "../deliver-attachment.js";
import {
  MAX_ATTACHMENT_BYTES,
  readAttachmentSource,
} from "../read-attachment-source.js";

const GATEWAY_KEY = "/Users/mcp/.mcp-gateway/assertion-key.pem";

const hostedDefaults = () => {
  vi.stubEnv("XERO_LOCAL_FILES", "");
  vi.stubEnv("XERO_FILE_URLS", "");
};

describe("hosted defaults: local files and links off", () => {
  beforeEach(hostedDefaults);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("refuses a file path without touching the disk", async () => {
    const stat = vi.spyOn(fs, "statSync");
    const read = vi.spyOn(fs, "readFileSync");

    await expect(
      readAttachmentSource({ filePath: GATEWAY_KEY }),
    ).rejects.toThrowError(/own disk/);

    expect(stat).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a link without fetching it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readAttachmentSource({ fileUrl: "https://agent.example.ts.net/secret" }),
    ).rejects.toThrowError(/from links/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still takes base64 content", async () => {
    const result = await readAttachmentSource({
      fileBase64: Buffer.from("a receipt").toString("base64"),
      fileName: "receipt.pdf",
    });

    expect(result.body.toString()).toBe("a receipt");
  });

  it("names only base64 when no source is given", async () => {
    const error = await readAttachmentSource({}).catch((e: Error) => e);

    expect((error as Error).message).toContain("fileBase64");
    expect((error as Error).message).not.toContain("filePath");
    expect((error as Error).message).not.toContain("fileUrl");
  });

  it("refuses to write to a path", () => {
    const write = vi.spyOn(fs, "writeFileSync");

    expect(() =>
      deliverAttachment(
        Buffer.from("x"),
        "a.pdf",
        "application/pdf",
        "/Users/mcp/.xero-mcp/token.json",
      ),
    ).toThrowError(/own disk/);

    expect(write).not.toHaveBeenCalled();
  });

  it("returns the file in the response", () => {
    const delivered = deliverAttachment(
      Buffer.from("%PDF-1.4"),
      "bill.pdf",
      "application/pdf",
    );

    expect(delivered.savedTo).toBeUndefined();
    expect(delivered.content?.toString()).toBe("%PDF-1.4");
  });

  it("refuses to return a file over the limit, and says what to do", () => {
    expect(() =>
      deliverAttachment(
        Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
        "huge.pdf",
        "application/pdf",
      ),
    ).toThrowError(/Open it in Xero/);
  });
});

describe("base64 uploads", () => {
  it("rejects content that isn't base64 rather than attaching a corrupt file", async () => {
    await expect(
      readAttachmentSource({
        fileBase64: "this is not base64!",
        fileName: "receipt.pdf",
      }),
    ).rejects.toThrowError(/not valid base64/);
  });

  it("tolerates line breaks", async () => {
    const encoded = Buffer.from("a receipt that wraps").toString("base64");
    const wrapped = `${encoded.slice(0, 10)}\n${encoded.slice(10)}`;

    const result = await readAttachmentSource({
      fileBase64: wrapped,
      fileName: "receipt.pdf",
    });

    expect(result.body.toString()).toBe("a receipt that wraps");
  });
});

describe("delivered attachment content", () => {
  const blocksFor = (mimeType: string) =>
    deliveredAttachmentContent(
      deliverAttachment(Buffer.from("hello"), "file", mimeType),
      "INV-1",
    );

  it("returns a PDF as an embedded resource", () => {
    const [summary, file] = blocksFor("application/pdf");

    expect(summary).toMatchObject({ type: "text" });
    expect((summary as { text: string }).text).toContain("Retrieved file from INV-1");
    expect(file).toMatchObject({
      type: "resource",
      resource: {
        mimeType: "application/pdf",
        blob: Buffer.from("hello").toString("base64"),
      },
    });
  });

  it("returns an image as an image", () => {
    expect(blocksFor("image/png")[1]).toMatchObject({
      type: "image",
      mimeType: "image/png",
      data: Buffer.from("hello").toString("base64"),
    });
  });

  it("returns text as text", () => {
    expect(blocksFor("text/csv")[1]).toEqual({ type: "text", text: "hello" });
  });
});

describe("with local files on", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.stubEnv("XERO_LOCAL_FILES", "1");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xero-deliver-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves to the path asked for", () => {
    const target = path.join(tempDir, "saved.pdf");

    const delivered = deliverAttachment(
      Buffer.from("x"),
      "bill.pdf",
      "application/pdf",
      target,
    );

    expect(delivered.savedTo).toBe(target);
    expect(delivered.content).toBeUndefined();
    expect(fs.readFileSync(target).toString()).toBe("x");
  });

  it("keeps a hostile attachment name inside the directory", () => {
    const delivered = deliverAttachment(
      Buffer.from("x"),
      "../../escaped.pdf",
      "application/pdf",
      tempDir,
    );

    expect(delivered.savedTo).toBe(path.join(tempDir, "escaped.pdf"));
  });

  it("returns the file in the response when no path is given", () => {
    const delivered = deliverAttachment(
      Buffer.from("x"),
      "bill.pdf",
      "application/pdf",
    );

    expect(delivered.content?.toString()).toBe("x");
  });
});
