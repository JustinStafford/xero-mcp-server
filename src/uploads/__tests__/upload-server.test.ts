import http from "node:http";
import { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockXeroClientModule,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { uploadRequestHandler } = await import("../upload-server.js");
const { UploadLinks, MAX_REJECTED_FILES } = await import("../upload-links.js");
const { sha256Hex } = await import("../attach-upload.js");

import type { UploadConfig } from "../upload-config.js";
import type { UploadLink, UploadOutcome } from "../upload-links.js";

const config: UploadConfig = {
  port: 0,
  publicUrl: "https://mcp.example.com/xero-upload",
  pathPrefix: "/xero-upload",
  ttlMs: 600_000,
  maxBytes: 1024,
};

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from([0, 255, 13, 10, 128])]);
const SECRET_NAME = "Confidential Supplier Bill.pdf";

let server: http.Server;
let base: string;
let links: InstanceType<typeof UploadLinks>;
let link: UploadLink;
let logs: string[];
let attach: ReturnType<typeof vi.fn>;

const outcomeFor = (body: Buffer, name: string): UploadOutcome => ({
  fileName: name,
  bytes: body.length,
  sha256: sha256Hex(body),
  mimeType: "application/pdf",
  storedOnRecord: true,
  contentMatches: true,
});

const urlFor = (token: string) => `${base}/xero-upload/${token}`;

const send = (
  token: string,
  body: Buffer,
  name: string,
  headers: Record<string, string> = {},
) => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(body)]), name);
  return fetch(urlFor(token), { method: "POST", body: form, headers });
};

beforeEach(async () => {
  resetMockXeroClient();
  logs = [];
  links = new UploadLinks(config.ttlMs);
  link = links.create("tenant-1", "Watagan <Homestead>", {
    kind: "invoice",
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    label: "Bill INV-0322 (Watagon) [DRAFT]",
    includeOnline: false,
  });
  attach = vi.fn(async (_link, payload) => outcomeFor(payload.body, payload.name));

  server = http.createServer(
    uploadRequestHandler(config, links, attach as never, (line) => logs.push(line)),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("upload listener", () => {
  it("gives the same answer for an unknown, malformed or off-path token", async () => {
    const answers = await Promise.all(
      [
        urlFor("x".repeat(43)),
        urlFor("short"),
        `${base}/xero-upload/`,
        `${base}/other/${link.token}`,
        `${base}/`,
      ].map(async (url) => {
        const response = await fetch(url);
        return [response.status, await response.text()];
      }),
    );

    for (const answer of answers) {
      expect(answer).toEqual(answers[0]);
    }
    expect(answers[0][0]).toBe(404);
  });

  it("shows which record the link is for, escaped, and never caches", async () => {
    const response = await fetch(urlFor(link.token), {
      headers: { accept: "text/html" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Bill INV-0322 (Watagon) [DRAFT]");
    expect(html).toContain("Watagan &lt;Homestead&gt;");
    expect(html).not.toContain("<Homestead>");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    // Looking at the page doesn't use the link.
    expect(links.open(link.token)).toBe(link);
  });

  it("attaches the exact bytes sent, and reports name, size and SHA-256", async () => {
    const response = await send(link.token, PDF, SECRET_NAME);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(attach).toHaveBeenCalledTimes(1);

    const [usedLink, payload, mimeType] = attach.mock.calls[0];
    expect(usedLink).toBe(link);
    expect(Buffer.compare(payload.body, PDF)).toBe(0);
    expect(payload.name).toBe(SECRET_NAME);
    expect(mimeType).toBe("application/pdf");

    expect(body).toMatchObject({
      ok: true,
      file: SECRET_NAME,
      size: `${PDF.length} bytes`,
      sha_256: sha256Hex(PDF),
    });
    expect(link.status).toBe("done");
  });

  it("works once", async () => {
    await send(link.token, PDF, "a.pdf");
    const second = await send(link.token, PDF, "a.pdf");

    expect(second.status).toBe(404);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it("refuses a second upload while the first is still attaching", async () => {
    let release!: () => void;
    attach.mockImplementationOnce(
      (_link, payload) =>
        new Promise((resolve) => {
          release = () => resolve(outcomeFor(payload.body, payload.name));
        }),
    );

    const first = send(link.token, PDF, "a.pdf");
    await vi.waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    const second = await send(link.token, PDF, "b.pdf");
    release();

    expect(second.status).toBe(404);
    expect((await first).status).toBe(200);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it("refuses a file that isn't PDF, PNG or JPG whatever it is called", async () => {
    const response = await send(link.token, Buffer.from("<html>hi</html>"), "bill.pdf");

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/contents are checked/);
    expect(attach).not.toHaveBeenCalled();
    // The wrong file doesn't burn the link.
    expect(links.open(link.token)).toBe(link);
  });

  it("refuses a name that contradicts the contents", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await send(link.token, png, "bill.pdf");

    expect(response.status).toBe(400);
    expect(attach).not.toHaveBeenCalled();
  });

  it("closes after too many refused files", async () => {
    for (let i = 0; i < MAX_REJECTED_FILES; i += 1) {
      await send(link.token, Buffer.from("nope"), "a.txt");
    }

    expect((await send(link.token, PDF, "a.pdf")).status).toBe(404);
    expect(attach).not.toHaveBeenCalled();
  });

  it("refuses a file over the limit", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(config.maxBytes)]);
    const response = await send(link.token, big, "big.pdf");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).message).toMatch(/over the .* limit/);
    expect(attach).not.toHaveBeenCalled();
  });

  it("refuses a body far over the limit without reading it", async () => {
    const response = await send(link.token, Buffer.alloc(200 * 1024), "big.pdf");

    expect(response.status).toBe(413);
    expect(attach).not.toHaveBeenCalled();
  });

  it("refuses anything but a multipart form, and more than one file", async () => {
    const raw = await fetch(urlFor(link.token), {
      method: "POST",
      body: new Uint8Array(PDF),
      headers: { "content-type": "application/pdf" },
    });
    expect(raw.status).toBe(415);

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(PDF)]), "a.pdf");
    form.append("other", new Blob([new Uint8Array(PDF)]), "b.pdf");
    const two = await fetch(urlFor(link.token), { method: "POST", body: form });
    expect(two.status).toBe(400);

    expect(attach).not.toHaveBeenCalled();
  });

  it("refuses other methods", async () => {
    const response = await fetch(urlFor(link.token), { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(links.open(link.token)).toBe(link);
  });

  it("is used up when Xero refuses the file, and says why", async () => {
    attach.mockRejectedValueOnce(new Error("Xero says no"));
    const response = await send(link.token, PDF, "a.pdf");

    expect(response.status).toBe(502);
    expect((await response.json()).message).toContain("Xero says no");
    expect(links.get("tenant-1", link.id)).toMatchObject({
      status: "failed",
      error: "Xero says no",
    });
    expect(links.open(link.token)).toBeUndefined();
  });

  it("flags a file that reads back differently", async () => {
    attach.mockImplementationOnce(async (_link, payload) => ({
      ...outcomeFor(payload.body, payload.name),
      contentMatches: false,
    }));
    const body = await (await send(link.token, PDF, "a.pdf")).json();

    expect(body.ok).toBe(false);
    expect(body.check).toMatch(/DIFFERENT/);
  });

  it("answers a browser with a page", async () => {
    const response = await send(link.token, PDF, "a.pdf", { accept: "text/html" });
    const html = await response.text();

    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(html).toContain(sha256Hex(PDF));
    expect(html).toContain("identical to the file sent");
  });

  it("never logs a token, a file name or file contents", async () => {
    await send(link.token, Buffer.from("<html>marker-contents</html>"), SECRET_NAME);
    await send(link.token, PDF, SECRET_NAME);
    await fetch(urlFor("y".repeat(43)));

    const all = logs.join("\n");
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(all).toContain(`link=${link.id}`);
    expect(all).not.toContain(link.token);
    expect(all).not.toContain("Confidential");
    expect(all).not.toContain("marker-contents");
    expect(all).not.toContain("y".repeat(43));
  });
});
