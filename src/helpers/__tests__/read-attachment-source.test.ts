import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  readAttachmentSource,
} from "../read-attachment-source.js";

describe("readAttachmentSource", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xero-attachment-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("requires a file source", async () => {
    await expect(readAttachmentSource({})).rejects.toThrowError(
      /No file supplied/,
    );
  });

  it("refuses more than one file source", async () => {
    await expect(
      readAttachmentSource({
        filePath: "/tmp/a.pdf",
        fileUrl: "https://example.com/a.pdf",
      }),
    ).rejects.toThrowError(/exactly one file source/);
  });

  describe("filePath", () => {
    it("reads the file and defaults the name to the file's own", async () => {
      const filePath = path.join(tempDir, "receipt.pdf");
      fs.writeFileSync(filePath, "a receipt");

      const result = await readAttachmentSource({ filePath });

      expect(result.name).toBe("receipt.pdf");
      expect(result.body.toString()).toBe("a receipt");
    });

    it("uses the supplied name over the file's own", async () => {
      const filePath = path.join(tempDir, "receipt.pdf");
      fs.writeFileSync(filePath, "a receipt");

      const result = await readAttachmentSource({
        filePath,
        fileName: "supplier-invoice.pdf",
      });

      expect(result.name).toBe("supplier-invoice.pdf");
    });

    it("says the file must be on the server when it is missing", async () => {
      await expect(
        readAttachmentSource({ filePath: path.join(tempDir, "absent.pdf") }),
      ).rejects.toThrowError(/fileUrl or fileBase64/);
    });

    it("rejects an empty file", async () => {
      const filePath = path.join(tempDir, "empty.pdf");
      fs.writeFileSync(filePath, "");

      await expect(readAttachmentSource({ filePath })).rejects.toThrowError(
        /is empty/,
      );
    });

    it("rejects a file above Xero's size limit", async () => {
      const filePath = path.join(tempDir, "big.pdf");
      fs.writeFileSync(filePath, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));

      await expect(readAttachmentSource({ filePath })).rejects.toThrowError(
        /3\.5MB/,
      );
    });
  });

  describe("fileBase64", () => {
    it("decodes the content", async () => {
      const result = await readAttachmentSource({
        fileBase64: Buffer.from("a receipt").toString("base64"),
        fileName: "receipt.pdf",
      });

      expect(result.name).toBe("receipt.pdf");
      expect(result.body.toString()).toBe("a receipt");
    });

    it("tolerates a data URL prefix", async () => {
      const result = await readAttachmentSource({
        fileBase64: `data:application/pdf;base64,${Buffer.from("a receipt").toString("base64")}`,
        fileName: "receipt.pdf",
      });

      expect(result.body.toString()).toBe("a receipt");
    });

    it("requires a file name, since there is nothing to infer one from", async () => {
      await expect(
        readAttachmentSource({
          fileBase64: Buffer.from("a receipt").toString("base64"),
        }),
      ).rejects.toThrowError(/fileName is required/);
    });

    it("rejects content that decodes to nothing", async () => {
      await expect(
        readAttachmentSource({ fileBase64: "!!!", fileName: "receipt.pdf" }),
      ).rejects.toThrowError(/empty file/);
    });
  });

  describe("fileUrl", () => {
    it("rejects a non-https link", async () => {
      await expect(
        readAttachmentSource({ fileUrl: "http://example.com/a.pdf" }),
      ).rejects.toThrowError(/must be an https link/);
    });

    it("rejects a malformed URL", async () => {
      await expect(
        readAttachmentSource({ fileUrl: "not a url" }),
      ).rejects.toThrowError(/not a valid URL/);
    });

    it.each([
      "https://localhost/a.pdf",
      "https://127.0.0.1/a.pdf",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/a.pdf",
      "https://192.168.1.1/a.pdf",
      "https://172.16.0.1/a.pdf",
    ])("refuses to fetch from %s", async (fileUrl) => {
      await expect(readAttachmentSource({ fileUrl })).rejects.toThrowError(
        /private and loopback/,
      );
    });
  });
});
