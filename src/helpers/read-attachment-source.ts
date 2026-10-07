import fs from "node:fs";
import path from "node:path";

/**
 * Xero rejects requests above 3.5MB. Checking locally turns an opaque
 * transport failure into a message that says what to do about it.
 */
export const MAX_ATTACHMENT_BYTES = Math.floor(3.5 * 1024 * 1024);

export interface AttachmentSource {
  filePath?: string;
  fileUrl?: string;
  fileBase64?: string;
  fileName?: string;
}

export interface AttachmentPayload {
  body: Buffer;
  name: string;
}

const tooBig = (bytes: number, label: string): Error =>
  new Error(
    `${label} is ${(bytes / 1024 / 1024).toFixed(1)}MB. Xero rejects requests above ` +
      "3.5MB, so this file must be reduced or split before it can be attached.",
  );

/**
 * Hosts that must never be fetched on a caller's behalf.
 *
 * A hosted server sits inside a network the caller cannot otherwise reach, so an
 * arbitrary fileUrl is a way to read from it.
 */
const isBlockedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    return true;
  }

  // IPv4 loopback, link-local (incl. cloud metadata), and the private ranges.
  return (
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^(fc|fd)[0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  );
};

/** Prefer the name the server advertised, then the URL, then the caller's. */
const nameFromResponse = (
  response: Response,
  url: URL,
  fallback?: string,
): string => {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match?.[1]) {
    return decodeURIComponent(match[1].trim());
  }

  const fromUrl = path.basename(url.pathname);
  if (fromUrl && fromUrl !== "/" && fromUrl.includes(".")) {
    return fromUrl;
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  throw new Error(
    "Could not work out a file name from the URL. Supply fileName as well.",
  );
};

const readFromDisk = (filePath: string, fileName?: string): AttachmentPayload => {
  const resolvedPath = path.resolve(filePath);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    throw new Error(
      `No file found at ${resolvedPath}. The file must exist on the machine ` +
        "running this server; a file in the conversation is not visible here. " +
        "Pass fileUrl or fileBase64 instead when the server is not local.",
    );
  }

  if (!stat.isFile()) {
    throw new Error(`${resolvedPath} is not a file.`);
  }

  if (stat.size === 0) {
    throw new Error(`${resolvedPath} is empty.`);
  }

  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw tooBig(stat.size, resolvedPath);
  }

  return {
    body: fs.readFileSync(resolvedPath),
    name: fileName?.trim() || path.basename(resolvedPath),
  };
};

const readFromUrl = async (
  fileUrl: string,
  fileName?: string,
): Promise<AttachmentPayload> => {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    throw new Error(`"${fileUrl}" is not a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `fileUrl must be an https link, received "${url.protocol}//".`,
    );
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error(
      `Refusing to fetch from ${url.hostname}: private and loopback addresses are ` +
        "not reachable through this tool.",
    );
  }

  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(
      `Downloading ${url.href} failed with HTTP ${response.status} ${response.statusText}.`,
    );
  }

  const declared = Number(response.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
    throw tooBig(declared, url.href);
  }

  const body = Buffer.from(await response.arrayBuffer());

  if (body.length === 0) {
    throw new Error(`${url.href} returned an empty file.`);
  }

  if (body.length > MAX_ATTACHMENT_BYTES) {
    throw tooBig(body.length, url.href);
  }

  return { body, name: nameFromResponse(response, url, fileName) };
};

const readFromBase64 = (
  fileBase64: string,
  fileName?: string,
): AttachmentPayload => {
  const name = fileName?.trim();
  if (!name) {
    throw new Error("fileName is required when the file is supplied as fileBase64.");
  }

  // Tolerates a data: URL, which is how a browser-side encoder usually produces one.
  const payload = fileBase64.replace(/^data:[^;]*;base64,/, "").trim();
  const body = Buffer.from(payload, "base64");

  if (body.length === 0) {
    throw new Error("fileBase64 decoded to an empty file. Check the encoding.");
  }

  if (body.length > MAX_ATTACHMENT_BYTES) {
    throw tooBig(body.length, "The supplied file");
  }

  return { body, name };
};

/**
 * Resolve a file supplied as a local path, an https URL, or base64 content.
 *
 * A local path only works when the server runs next to the person using it. A
 * hosted server has no path the caller can name and no way to receive a file on
 * disk, so the other two routes are what make attachments work from ChatGPT.
 */
export const readAttachmentSource = async (
  source: AttachmentSource,
): Promise<AttachmentPayload> => {
  const supplied = [
    source.filePath ? "filePath" : null,
    source.fileUrl ? "fileUrl" : null,
    source.fileBase64 ? "fileBase64" : null,
  ].filter(Boolean);

  if (supplied.length === 0) {
    throw new Error(
      "No file supplied. Give exactly one of filePath (local server only), fileUrl " +
        "(an https link), or fileBase64 (the file's contents, with fileName).",
    );
  }

  if (supplied.length > 1) {
    throw new Error(
      `Give exactly one file source, received ${supplied.join(" and ")}.`,
    );
  }

  if (source.filePath) {
    return readFromDisk(source.filePath, source.fileName);
  }

  if (source.fileUrl) {
    return readFromUrl(source.fileUrl, source.fileName);
  }

  return readFromBase64(source.fileBase64 as string, source.fileName);
};
