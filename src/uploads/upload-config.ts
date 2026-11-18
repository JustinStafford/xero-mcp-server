import { MAX_ATTACHMENT_BYTES } from "../helpers/read-attachment-source.js";

/**
 * One-time upload links: how a file reaches a hosted server without an agent
 * typing it out as base64.
 *
 * Off unless both settings are present. The server then listens on loopback
 * only; whatever fronts it (a gateway, a reverse proxy) forwards the public
 * path to that port, and the link's token is the only thing protecting it.
 */
export interface UploadConfig {
  /** Loopback port the upload listener binds. */
  port: number;
  /** Public base the links are built on, e.g. https://mcp.example.com/xero-upload. */
  publicUrl: string;
  /** The path the listener answers on: the public base's own path. */
  pathPrefix: string;
  ttlMs: number;
  maxBytes: number;
}

const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 900;
/** A ceiling on XERO_UPLOAD_MAX_BYTES, so a typo can't make it unbounded. */
const HARD_MAX_BYTES = 25 * 1024 * 1024;

const positiveInt = (raw: string | undefined): number | null => {
  if (!raw || !/^\d+$/.test(raw.trim())) {
    return null;
  }
  const value = Number(raw.trim());
  return value > 0 ? value : null;
};

export const uploadConfig = (): UploadConfig | null => {
  const port = positiveInt(process.env.XERO_UPLOAD_PORT);
  const rawUrl = process.env.XERO_UPLOAD_URL?.trim();

  if (!port || port > 65535 || !rawUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const pathPrefix = url.pathname.replace(/\/+$/, "");
  if (url.protocol !== "https:" || !pathPrefix || url.search || url.hash) {
    return null;
  }

  const ttlSeconds = Math.min(
    positiveInt(process.env.XERO_UPLOAD_TTL_SECONDS) ?? DEFAULT_TTL_SECONDS,
    MAX_TTL_SECONDS,
  );

  const maxBytes = Math.min(
    positiveInt(process.env.XERO_UPLOAD_MAX_BYTES) ?? MAX_ATTACHMENT_BYTES,
    HARD_MAX_BYTES,
  );

  return {
    port,
    publicUrl: `${url.origin}${pathPrefix}`,
    pathPrefix,
    ttlMs: ttlSeconds * 1000,
    maxBytes,
  };
};

export const uploadsEnabled = (): boolean => uploadConfig() !== null;

export const describeMaxBytes = (bytes: number): string => {
  const mb = bytes / 1024 / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
};

/** A sentence for the attachment tools' descriptions, when links are on. */
export const describeUploadLinks = (): string =>
  uploadsEnabled()
    ? " For anything but a tiny file, don't encode it yourself: call " +
      "create-attachment-upload-link and send the file to the link it returns."
    : "";
