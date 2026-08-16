import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenSetParameters } from "xero-node";

/**
 * Persistent store for the OAuth 2.0 token set.
 *
 * A single token set covers every authorised organisation — the refresh token
 * is issued per user-per-app, not per tenant — so one file is all that is
 * needed regardless of how many orgs are connected.
 *
 * Xero ROTATES refresh tokens: each refresh invalidates the previous one and
 * returns a replacement. Losing a rotated token means re-authorising every
 * organisation by hand, so writes are atomic (write-then-rename) and always
 * happen before the new token is used.
 */

const DEFAULT_DIR = path.join(os.homedir(), ".xero-mcp");
const DEFAULT_FILE = path.join(DEFAULT_DIR, "token.json");

export const getTokenFilePath = (): string =>
  process.env.XERO_TOKEN_FILE || DEFAULT_FILE;

export interface StoredTokenSet extends TokenSetParameters {
  /** Epoch seconds. Present on tokens issued by Xero. */
  expires_at?: number;
}

export const readTokenSet = (): StoredTokenSet | null => {
  const file = getTokenFilePath();
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as StoredTokenSet;
    if (!parsed?.access_token) return null;
    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new Error(
      `Xero token file at ${file} could not be read: ${(error as Error).message}`,
    );
  }
};

export const writeTokenSet = (tokenSet: StoredTokenSet): void => {
  const file = getTokenFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  // Atomic: a crash mid-write must not leave a truncated token file, because
  // the refresh token it holds may already be the only valid one.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tokenSet, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
};

export const clearTokenSet = (): void => {
  try {
    fs.unlinkSync(getTokenFilePath());
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
};

/** True when the access token is absent, expired, or about to expire. */
export const isExpiring = (
  tokenSet: StoredTokenSet | null,
  skewSeconds = 120,
): boolean => {
  if (!tokenSet?.access_token) return true;
  if (!tokenSet.expires_at) return true;
  return tokenSet.expires_at - skewSeconds <= Math.floor(Date.now() / 1000);
};
