import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_ATTACHMENT_BYTES } from "../../helpers/read-attachment-source.js";
import { safeUploadName, sniffUploadKind } from "../file-type.js";
import { describeUploadLinks, uploadConfig } from "../upload-config.js";
import {
  MAX_OPEN_LINKS,
  MAX_REJECTED_FILES,
  TOKEN_PATTERN,
  UploadLinks,
  UploadTarget,
} from "../upload-links.js";

const PDF = Buffer.from("%PDF-1.7 a bill");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

const target: UploadTarget = {
  kind: "invoice",
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  label: "Bill INV-1",
  includeOnline: false,
};

describe("upload config", () => {
  afterEach(() => vi.unstubAllEnvs());

  const on = (url = "https://mcp.example.com/xero-upload") => {
    vi.stubEnv("XERO_UPLOAD_PORT", "8011");
    vi.stubEnv("XERO_UPLOAD_URL", url);
  };

  it("is off unless both the port and the public URL are set", () => {
    vi.stubEnv("XERO_UPLOAD_PORT", "");
    vi.stubEnv("XERO_UPLOAD_URL", "");
    expect(uploadConfig()).toBeNull();
    expect(describeUploadLinks()).toBe("");

    vi.stubEnv("XERO_UPLOAD_PORT", "8011");
    expect(uploadConfig()).toBeNull();
  });

  it("takes the listener's path from the public URL", () => {
    on("https://mcp.example.com/xero-upload/");
    expect(uploadConfig()).toMatchObject({
      port: 8011,
      publicUrl: "https://mcp.example.com/xero-upload",
      pathPrefix: "/xero-upload",
      ttlMs: 600_000,
      maxBytes: MAX_ATTACHMENT_BYTES,
    });
    expect(describeUploadLinks()).toMatch(/create-attachment-upload-link/);
  });

  it.each([
    "http://mcp.example.com/xero-upload",
    "https://mcp.example.com",
    "https://mcp.example.com/x?y=1",
    "not a url",
  ])("refuses %s as the public URL", (url) => {
    on(url);
    expect(uploadConfig()).toBeNull();
  });

  it("caps how long a link lives and how big a file can be", () => {
    on();
    vi.stubEnv("XERO_UPLOAD_TTL_SECONDS", "86400");
    vi.stubEnv("XERO_UPLOAD_MAX_BYTES", "999999999999");
    expect(uploadConfig()).toMatchObject({
      ttlMs: 900_000,
      maxBytes: 25 * 1024 * 1024,
    });
  });
});

describe("file type, by content", () => {
  it("recognises PDF, PNG and JPG from their first bytes", () => {
    expect(sniffUploadKind(PDF)?.ext).toBe("pdf");
    expect(sniffUploadKind(PNG)?.ext).toBe("png");
    expect(sniffUploadKind(JPG)?.ext).toBe("jpg");
  });

  it.each([
    ["html", Buffer.from("<html><script>alert(1)</script>")],
    ["a zip or Word file", Buffer.from("PK\u0003\u0004 docx")],
    ["a script", Buffer.from("#!/bin/sh\nrm -rf /")],
    ["a PDF marker that isn't at the start", Buffer.from(" %PDF-1.7")],
    ["nothing", Buffer.alloc(0)],
  ])("refuses %s", (_label, body) => {
    expect(sniffUploadKind(body)).toBeNull();
  });

  it("keeps a good name and its own extension", () => {
    const kind = sniffUploadKind(JPG)!;
    expect(safeUploadName("Invoice INV-0322- Watagon.JPEG", kind)).toBe(
      "Invoice INV-0322- Watagon.jpeg",
    );
  });

  it("keeps only the last path segment and drops unsafe characters", () => {
    const kind = sniffUploadKind(PDF)!;
    expect(safeUploadName("../../etc/passwd", kind)).toBe("passwd.pdf");
    expect(safeUploadName("C:\\Users\\me\\bill.pdf", kind)).toBe("bill.pdf");
    expect(safeUploadName('a<b>:"c|?*\u0000\n.pdf', kind)).toBe("abc.pdf");
    expect(safeUploadName("...hidden.pdf", kind)).toBe("hidden.pdf");
  });

  it("gives an unnamed or oddly named file the extension its contents call for", () => {
    const kind = sniffUploadKind(PDF)!;
    expect(safeUploadName("", kind)).toBe("upload.pdf");
    expect(safeUploadName("scan", kind)).toBe("scan.pdf");
    expect(safeUploadName("scan.final", kind)).toBe("scan.final.pdf");
    expect(safeUploadName("report.exe", kind)).toBe("report.exe.pdf");
  });

  it("refuses a name that claims a different kind than the contents", () => {
    expect(() => safeUploadName("bill.pdf", sniffUploadKind(PNG)!)).toThrowError(
      /named \.pdf but its contents are a PNG image/,
    );
  });

  it("keeps long names within bounds, extension intact", () => {
    const name = safeUploadName(`${"x".repeat(400)}.pdf`, sniffUploadKind(PDF)!);
    expect(name.length).toBe(150);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("upload links", () => {
  const clock = () => {
    let now = 1_000_000;
    return { now: () => now, advance: (ms: number) => (now += ms) };
  };

  it("mints an unguessable token and a separate short ID", () => {
    const links = new UploadLinks(600_000);
    const a = links.create("t1", "Org", target);
    const b = links.create("t1", "Org", target);

    expect(a.token).toMatch(TOKEN_PATTERN);
    expect(a.token).not.toBe(b.token);
    expect(a.id).toMatch(/^[0-9a-f]{12}$/);
    expect(a.token).not.toContain(a.id);
    expect(links.open(a.token)).toBe(a);
  });

  it("opens nothing for a wrong or malformed token", () => {
    const links = new UploadLinks(600_000);
    links.create("t1", "Org", target);

    expect(links.open("x".repeat(43))).toBeUndefined();
    expect(links.open("")).toBeUndefined();
    expect(links.open("../../etc/passwd")).toBeUndefined();
  });

  it("expires", () => {
    const time = clock();
    const links = new UploadLinks(600_000, time.now);
    const link = links.create("t1", "Org", target);

    time.advance(599_999);
    expect(links.open(link.token)).toBe(link);
    time.advance(1);
    expect(links.open(link.token)).toBeUndefined();
    expect(links.get("t1", link.id)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/expired/),
    });
  });

  it("works once", () => {
    const links = new UploadLinks(600_000);
    const link = links.create("t1", "Org", target);

    links.finish(link, {
      fileName: "a.pdf",
      bytes: 1,
      sha256: "00",
      mimeType: "application/pdf",
      storedOnRecord: true,
      contentMatches: true,
    });

    expect(links.open(link.token)).toBeUndefined();
    expect(links.get("t1", link.id)?.status).toBe("done");
  });

  it("can't be taken by a second upload while one is in flight", () => {
    const links = new UploadLinks(600_000);
    const link = links.create("t1", "Org", target);
    link.status = "busy";

    expect(links.open(link.token)).toBeUndefined();
  });

  it("survives a few refused files, then closes", () => {
    const links = new UploadLinks(600_000);
    const link = links.create("t1", "Org", target);

    for (let i = 1; i < MAX_REJECTED_FILES; i += 1) {
      links.reject(link, "wrong type");
      expect(links.open(link.token)).toBe(link);
    }
    links.reject(link, "wrong type");
    expect(links.open(link.token)).toBeUndefined();
    expect(link.status).toBe("failed");
  });

  it("is only readable in the organisation it was made in", () => {
    const links = new UploadLinks(600_000);
    const link = links.create("t1", "Org", target);

    expect(links.get("t1", link.id)).toBe(link);
    expect(links.get("t2", link.id)).toBeUndefined();
  });

  it("forgets a finished link after an hour", () => {
    const time = clock();
    const links = new UploadLinks(600_000, time.now);
    const link = links.create("t1", "Org", target);
    links.fail(link, "nope");

    time.advance(600_000 + 60 * 60 * 1000);
    expect(links.get("t1", link.id)).toBeUndefined();
  });

  it("bounds how many can be open, and frees room as they close", () => {
    const time = clock();
    const links = new UploadLinks(600_000, time.now);
    for (let i = 0; i < MAX_OPEN_LINKS; i += 1) {
      links.create("t1", "Org", target);
    }
    expect(() => links.create("t1", "Org", target)).toThrowError(/already open/);

    time.advance(600_000);
    expect(links.create("t1", "Org", target).status).toBe("open");
  });
});
