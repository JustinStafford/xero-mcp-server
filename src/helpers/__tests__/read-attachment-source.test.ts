import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_REDIRECTS,
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

    describe("downloading", () => {
      const realFetch = globalThis.fetch;

      /** Queue one Response per expected hop. */
      const givenResponses = (...responses: Response[]): typeof fetch => {
        const fetchMock = vi.fn(async () => responses.shift() as Response);
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        return fetchMock as unknown as typeof fetch;
      };

      const pdf = (body = "%PDF-1.4 downloaded", headers: HeadersInit = {}) =>
        new Response(body, { status: 200, headers });

      const redirectTo = (location: string) =>
        new Response(null, { status: 302, headers: { location } });

      afterEach(() => {
        globalThis.fetch = realFetch;
        vi.restoreAllMocks();
      });

      it("downloads the file and names it from the URL", async () => {
        givenResponses(pdf());

        const result = await readAttachmentSource({
          fileUrl: "https://files.example.test/receipt.pdf",
        });

        expect(result.name).toBe("receipt.pdf");
        expect(result.body.toString()).toContain("%PDF-1.4");
      });

      it("prefers the name the server advertised", async () => {
        givenResponses(
          pdf("%PDF-1.4", {
            "content-disposition": 'attachment; filename="supplier-invoice.pdf"',
          }),
        );

        const result = await readAttachmentSource({
          fileUrl: "https://files.example.test/download",
        });

        expect(result.name).toBe("supplier-invoice.pdf");
      });

      it("falls back to the supplied name when the URL has none", async () => {
        givenResponses(pdf());

        const result = await readAttachmentSource({
          fileUrl: "https://files.example.test/download",
          fileName: "receipt.pdf",
        });

        expect(result.name).toBe("receipt.pdf");
      });

      it("asks for a name when there is nothing to infer one from", async () => {
        givenResponses(pdf());

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/download" }),
        ).rejects.toThrowError(/Supply fileName/);
      });

      it("follows a redirect to another public host", async () => {
        givenResponses(
          redirectTo("https://cdn.example.test/receipt.pdf"),
          pdf(),
        );

        const result = await readAttachmentSource({
          fileUrl: "https://files.example.test/receipt.pdf",
        });

        expect(result.body.toString()).toContain("%PDF-1.4");
      });

      it.each([
        "https://127.0.0.1/secret",
        "http://169.254.169.254/latest/meta-data",
        "https://10.0.0.5/secret",
      ])("blocks a redirect to %s", async (location) => {
        // The host check has to run on every hop. Checking only the first one
        // lets a public URL redirect into the network the server sits inside.
        givenResponses(redirectTo(location), pdf("should never be read"));

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/private and loopback|must be an https link/);
      });

      it("blocks a relative redirect that lands on a blocked host", async () => {
        givenResponses(redirectTo("//127.0.0.1/secret"), pdf());

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/private and loopback/);
      });

      it("stops a redirect loop instead of following it forever", async () => {
        givenResponses(
          ...Array.from({ length: MAX_ATTACHMENT_REDIRECTS + 1 }, (_, i) =>
            redirectTo(`https://cdn.example.test/hop-${i}`),
          ),
        );

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/redirected more than/);
      });

      it("reports an HTTP failure", async () => {
        givenResponses(new Response("nope", { status: 404, statusText: "Not Found" }));

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/HTTP 404/);
      });

      it("rejects a file the server declares as too big, before downloading it", async () => {
        givenResponses(
          new Response("x", {
            status: 200,
            headers: { "content-length": String(MAX_ATTACHMENT_BYTES + 1) },
          }),
        );

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/3\.5MB/);
      });

      it("rejects a file that turns out to be too big once downloaded", async () => {
        givenResponses(pdf("x".repeat(MAX_ATTACHMENT_BYTES + 1)));

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/3\.5MB/);
      });

      it("rejects an empty download", async () => {
        givenResponses(pdf(""));

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/empty file/);
      });

      it("rejects a redirect to a malformed location", async () => {
        givenResponses(redirectTo("http://"));

        await expect(
          readAttachmentSource({ fileUrl: "https://files.example.test/receipt.pdf" }),
        ).rejects.toThrowError(/invalid URL|must be an https link/);
      });
    });
  });
});
