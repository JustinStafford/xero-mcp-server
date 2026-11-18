import http from "node:http";

import { ensureError } from "../helpers/ensure-error.js";
import { AttachmentPayload } from "../helpers/read-attachment-source.js";
import { attachUpload } from "./attach-upload.js";
import { ACCEPTED_KINDS, safeUploadName, sniffUploadKind } from "./file-type.js";
import { UploadConfig, describeMaxBytes } from "./upload-config.js";
import {
  UploadLink,
  UploadLinks,
  UploadOutcome,
  setListenerProblem,
} from "./upload-links.js";

/** Room for the multipart envelope around a file at the size limit. */
const ENVELOPE_BYTES = 64 * 1024;

type Attach = (
  link: UploadLink,
  payload: AttachmentPayload,
  mimeType: string,
) => Promise<UploadOutcome>;

const GONE =
  "This upload link has expired or already been used. Ask Claude for a new one.";

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const page = (body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Attach a file in Xero</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem;color:#1c1c1c;background:#fff}
h1{font-size:1.25rem}dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem}
dt{color:#555}dd{margin:0;overflow-wrap:anywhere}button{font:inherit;padding:.5rem 1rem;margin-top:1rem}
.bad{color:#a11}code{font-size:.85em}
@media(prefers-color-scheme:dark){body{color:#eee;background:#161616}dt{color:#aaa}.bad{color:#f88}}
</style></head><body><h1>Attach a file in Xero</h1>${body}</body></html>`;

const outcomeRows = (outcome: UploadOutcome): Array<[string, string]> => [
  ["File", outcome.fileName],
  ["Size", `${outcome.bytes} bytes`],
  ["SHA-256", outcome.sha256],
  [
    "Check",
    outcome.contentMatches === true
      ? "Read back from Xero: identical to the file sent."
      : outcome.contentMatches === false
        ? "Read back from Xero: DIFFERENT from the file sent. Check it in Xero."
        : outcome.storedOnRecord
          ? "Stored on the record. It couldn't be read back to compare."
          : "Xero accepted it, but it isn't listed on the record. Check it in Xero.",
  ],
];

const definitionList = (rows: Array<[string, string]>): string =>
  `<dl>${rows
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join("")}</dl>`;

const linkRows = (link: UploadLink): Array<[string, string]> => [
  ["Organisation", link.tenantName],
  ["Attach to", link.target.label],
];

/** Read a request body, refusing to hold more than `limit` bytes. */
const readBody = (req: http.IncomingMessage, limit: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

/** The one file in a multipart form, parsed by the platform's own parser. */
const fileFromForm = async (
  contentType: string,
  body: Buffer,
): Promise<{ name: string; body: Buffer }> => {
  const form = await new Request("http://upload.invalid/", {
    method: "POST",
    headers: { "content-type": contentType },
    body: new Uint8Array(body),
  }).formData();

  const files = [...form.values()].filter(
    (value): value is File => typeof value !== "string",
  );
  if (files.length !== 1) {
    throw new Error("Send exactly one file.");
  }

  return {
    name: files[0].name,
    body: Buffer.from(await files[0].arrayBuffer()),
  };
};

/**
 * The upload listener's request handler.
 *
 * Unauthenticated by design: whatever fronts this server forwards the upload
 * path without credentials, because a browser following a link has none. The
 * token in the path is the whole protection, so nothing here says whether a
 * token was ever valid, and nothing logs one.
 */
export const uploadRequestHandler = (
  config: UploadConfig,
  links: UploadLinks,
  attach: Attach = attachUpload,
  log: (line: string) => void = (line) => console.error(line),
): http.RequestListener => {
  const limits = `One ${ACCEPTED_KINDS} file, up to ${describeMaxBytes(config.maxBytes)}.`;

  return async (req, res) => {
    const wantsHtml = (req.headers.accept ?? "").includes("text/html");

    const reply = (
      status: number,
      ok: boolean,
      message: string,
      rows: Array<[string, string]> = [],
      extraHtml = "",
    ): void => {
      const headers = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      };
      if (wantsHtml) {
        res.writeHead(status, {
          ...headers,
          "content-type": "text/html; charset=utf-8",
        });
        res.end(
          page(
            `<p${ok ? "" : ' class="bad"'}>${escapeHtml(message)}</p>` +
              definitionList(rows) +
              extraHtml,
          ),
        );
        return;
      }
      res.writeHead(status, {
        ...headers,
        "content-type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({
          ok,
          message,
          ...Object.fromEntries(
            rows.map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]+/g, "_"), v]),
          ),
        }) + "\n",
      );
    };

    const path = (req.url ?? "").split("?")[0];
    const prefix = `${config.pathPrefix}/`;
    const link = path.startsWith(prefix)
      ? links.open(path.slice(prefix.length))
      : undefined;

    if (!link) {
      reply(404, false, GONE);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      reply(
        200,
        true,
        `Choose the file to attach. ${limits} The link works once.`,
        linkRows(link),
        '<form method="post" enctype="multipart/form-data">' +
          '<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg">' +
          '<br><button type="submit">Attach</button></form>',
      );
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      reply(405, false, "Send the file with POST.");
      return;
    }

    const refuse = (status: number, message: string): void => {
      links.reject(link, message);
      log(`upload link=${link.id} status=refused http=${status}`);
      reply(status, false, message, linkRows(link));
    };

    const contentType = req.headers["content-type"] ?? "";
    const declared = Number(req.headers["content-length"] ?? NaN);

    // Claimed before the body is read, so a second request can't race this one.
    link.status = "busy";

    if (!/^multipart\/form-data\b/i.test(contentType)) {
      refuse(415, 'Send the file as a multipart form field named "file".');
      return;
    }
    if (!Number.isFinite(declared)) {
      refuse(411, "The upload needs a Content-Length.");
      return;
    }
    if (declared > config.maxBytes + ENVELOPE_BYTES) {
      refuse(413, `The file is over the ${describeMaxBytes(config.maxBytes)} limit.`);
      return;
    }

    let payload: AttachmentPayload;
    let mimeType: string;
    try {
      const raw = await readBody(req, config.maxBytes + ENVELOPE_BYTES);
      const file = await fileFromForm(contentType, raw);

      if (file.body.length === 0) {
        throw new Error("The file is empty.");
      }
      if (file.body.length > config.maxBytes) {
        throw new Error(
          `The file is over the ${describeMaxBytes(config.maxBytes)} limit.`,
        );
      }

      const kind = sniffUploadKind(file.body);
      if (!kind) {
        throw new Error(
          `That isn't a ${ACCEPTED_KINDS} file. The contents are checked, not the name.`,
        );
      }

      payload = { body: file.body, name: safeUploadName(file.name, kind) };
      mimeType = kind.mimeType;
    } catch (error) {
      const message = ensureError(error).message;
      // Only messages written above are shown; a parser's own wording isn't.
      const known = /^(The file|That isn't|Send exactly)/.test(message);
      refuse(
        message === "too large" ? 413 : 400,
        known ? message : "The upload couldn't be read. Send one file as a multipart form.",
      );
      return;
    }

    const started = Date.now();
    try {
      const outcome = await attach(link, payload, mimeType);
      links.finish(link, outcome);
      log(
        `upload link=${link.id} status=done bytes=${outcome.bytes} ` +
          `match=${outcome.contentMatches} ms=${Date.now() - started}`,
      );
      reply(
        200,
        outcome.contentMatches !== false && outcome.storedOnRecord,
        `Attached to ${link.target.label}. You can close this page and go back to Claude.`,
        [...linkRows(link), ...outcomeRows(outcome)],
      );
    } catch (error) {
      const message = ensureError(error).message.slice(0, 500);
      links.fail(link, message);
      log(`upload link=${link.id} status=failed ms=${Date.now() - started}`);
      reply(502, false, `Xero didn't accept the file: ${message}`, linkRows(link));
    }
  };
};

export interface UploadServerOptions {
  /** How long to wait before trying a busy port again. */
  retryMs?: number;
  /** How many times to try a busy port again before giving up. */
  retries?: number;
  /** The MCP client's end of the conversation: when it closes, so does the listener. */
  input?: NodeJS.ReadableStream;
}

/**
 * Start the loopback listener. A failure is recorded, not thrown: the tools report it.
 *
 * The listener must never be what keeps this process alive. This is a stdio
 * server: when its client goes away, stdin closes and the process has to end.
 * A listener holding the event loop open would leave an orphan behind, still
 * bound to the port (so its replacement can't take uploads) and still holding
 * the Xero token. So the listener is unref'd, and closes when stdin does.
 *
 * A replacement can start before the process it replaces has gone, so a busy
 * port is tried again for a while rather than given up on.
 */
export const startUploadServer = (
  config: UploadConfig,
  links: UploadLinks,
  options: UploadServerOptions = {},
): http.Server => {
  const { retryMs = 2000, retries = 30, input = process.stdin } = options;

  const server = http.createServer(uploadRequestHandler(config, links));
  // No slow trickle of headers or body can hold a connection open for long.
  server.headersTimeout = 15_000;
  server.requestTimeout = 120_000;
  server.unref();

  let attempts = 0;
  let stopped = false;
  const listen = (): void => {
    if (!stopped) {
      server.listen(config.port, "127.0.0.1");
    }
  };

  server.on("listening", () => setListenerProblem(null));
  server.on("error", (error: NodeJS.ErrnoException) => {
    setListenerProblem(`The upload listener failed: ${error.message}`);

    if (error.code === "EADDRINUSE" && !stopped && attempts < retries) {
      attempts += 1;
      setTimeout(listen, retryMs).unref();
      return;
    }
    console.error(`upload listener error: ${error.message}`);
  });

  const stop = (): void => {
    stopped = true;
    setListenerProblem("The upload listener has stopped.");
    if (server.listening) {
      // An upload already in flight finishes; nothing new is accepted.
      server.close();
    }
  };
  input.once("end", stop);
  input.once("close", stop);

  listen();
  return server;
};
