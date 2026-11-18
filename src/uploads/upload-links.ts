import { randomBytes } from "node:crypto";

export interface UploadTarget {
  kind: "invoice" | "bank-transaction";
  /** The record's Xero ID, resolved when the link was made. */
  id: string;
  /** How the record reads to a person, e.g. "Bill INV-0322 (Supplier) [DRAFT]". */
  label: string;
  includeOnline: boolean;
}

export interface UploadOutcome {
  fileName: string;
  bytes: number;
  sha256: string;
  mimeType: string;
  /** The attachment appeared on the record when it was listed again. */
  storedOnRecord: boolean;
  /**
   * The file read back from Xero has the same SHA-256 as the one uploaded.
   * null when it couldn't be read back, so nothing is claimed either way.
   */
  contentMatches: boolean | null;
}

export type UploadStatus = "open" | "busy" | "done" | "failed";

export interface UploadLink {
  id: string;
  token: string;
  tenantId: string;
  tenantName: string;
  target: UploadTarget;
  expiresAt: number;
  status: UploadStatus;
  /** Files refused before anything was sent to Xero. */
  rejected: number;
  error?: string;
  outcome?: UploadOutcome;
}

/** Enough to cover a batch of bills, few enough to bound what a caller can open. */
export const MAX_OPEN_LINKS = 20;
/** A typo or the wrong file shouldn't burn the link; endless guessing should. */
export const MAX_REJECTED_FILES = 5;
/** How long a finished link's result stays readable. */
const RESULT_RETENTION_MS = 60 * 60 * 1000;

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Open upload links, in memory only: a restart cancels them all.
 *
 * A link is a capability for exactly one thing — attaching one file to the one
 * record it was made for — so nothing about it is worth persisting, and a
 * token on disk would be a second place for it to leak.
 */
export class UploadLinks {
  private readonly byTokenMap = new Map<string, UploadLink>();
  private readonly byIdMap = new Map<string, UploadLink>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private sweep(): void {
    const now = this.now();
    for (const link of this.byIdMap.values()) {
      // An upload already in flight is left to finish.
      if (link.status === "open" && now >= link.expiresAt) {
        this.fail(link, "The link expired before a file was sent.");
      }
      if (link.status !== "busy" && now >= link.expiresAt + RESULT_RETENTION_MS) {
        this.byIdMap.delete(link.id);
      }
    }
  }

  create(tenantId: string, tenantName: string, target: UploadTarget): UploadLink {
    this.sweep();

    if (this.byTokenMap.size >= MAX_OPEN_LINKS) {
      throw new Error(
        `${MAX_OPEN_LINKS} upload links are already open. Use one, or wait for them to expire.`,
      );
    }

    const link: UploadLink = {
      id: randomBytes(6).toString("hex"),
      token: randomBytes(32).toString("base64url"),
      tenantId,
      tenantName,
      target,
      expiresAt: this.now() + this.ttlMs,
      status: "open",
      rejected: 0,
    };

    this.byTokenMap.set(link.token, link);
    this.byIdMap.set(link.id, link);
    return link;
  }

  /** A link that can still take a file, or undefined. */
  open(token: string): UploadLink | undefined {
    if (!TOKEN_PATTERN.test(token)) {
      return undefined;
    }
    this.sweep();
    const link = this.byTokenMap.get(token);
    return link?.status === "open" ? link : undefined;
  }

  /** A link by its ID, only for the organisation it was made in. */
  get(tenantId: string, id: string): UploadLink | undefined {
    this.sweep();
    const link = this.byIdMap.get(id.trim().toLowerCase());
    return link?.tenantId === tenantId ? link : undefined;
  }

  /** A file was refused before reaching Xero: the link survives a few of these. */
  reject(link: UploadLink, reason: string): void {
    link.rejected += 1;
    if (link.rejected >= MAX_REJECTED_FILES) {
      this.fail(link, `Too many refused files. The last: ${reason}`);
    } else {
      link.status = "open";
    }
  }

  fail(link: UploadLink, reason: string): void {
    link.status = "failed";
    link.error = reason;
    this.byTokenMap.delete(link.token);
  }

  finish(link: UploadLink, outcome: UploadOutcome): void {
    link.status = "done";
    link.outcome = outcome;
    this.byTokenMap.delete(link.token);
  }
}

let shared: UploadLinks | null = null;

/** The process's one set of links, created on first use. */
export const uploadLinks = (ttlMs: number): UploadLinks => {
  shared ??= new UploadLinks(ttlMs);
  return shared;
};

/** Why the upload listener isn't running, when it isn't. Set at startup. */
let listenerProblem: string | null = "The upload listener hasn't started.";

export const setListenerProblem = (problem: string | null): void => {
  listenerProblem = problem;
};

export const getListenerProblem = (): string | null => listenerProblem;
