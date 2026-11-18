/**
 * What an upload link accepts, decided by the file's own bytes.
 *
 * The name a browser or curl sends is whatever the sender chose, so it is only
 * ever used as a label, and one that contradicts the contents is refused.
 */
export interface UploadKind {
  ext: "pdf" | "png" | "jpg";
  mimeType: string;
  label: string;
  /** Extensions a file of this kind may carry. */
  extensions: string[];
}

const PDF: UploadKind = {
  ext: "pdf",
  mimeType: "application/pdf",
  label: "PDF",
  extensions: ["pdf"],
};
const PNG: UploadKind = {
  ext: "png",
  mimeType: "image/png",
  label: "PNG image",
  extensions: ["png"],
};
const JPG: UploadKind = {
  ext: "jpg",
  mimeType: "image/jpeg",
  label: "JPG image",
  extensions: ["jpg", "jpeg"],
};

const KINDS = [PDF, PNG, JPG];

export const ACCEPTED_KINDS = "PDF, PNG or JPG";

const startsWith = (body: Buffer, bytes: number[]): boolean =>
  body.length >= bytes.length && bytes.every((byte, i) => body[i] === byte);

/** The kind of file these bytes are, or null when it isn't one we accept. */
export const sniffUploadKind = (body: Buffer): UploadKind | null => {
  if (startsWith(body, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return PDF; // %PDF-
  }
  if (startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return PNG;
  }
  if (startsWith(body, [0xff, 0xd8, 0xff])) {
    return JPG;
  }
  return null;
};

const MAX_NAME_LENGTH = 150;

/**
 * A name safe to store the file under in Xero.
 *
 * Keeps only the last path segment, drops control characters and the ones file
 * systems reject, and makes the extension agree with the contents. Throws when
 * the name claims to be a different accepted kind than the bytes are.
 */
export const safeUploadName = (raw: string, kind: UploadKind): string => {
  const base =
    (raw ?? "")
      .split(/[\\/]/)
      .pop()
      ?.split("")
      .filter((char) => char >= " " && char !== "\u007f" && !'<>:"|?*'.includes(char))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "") ?? "";

  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim() || "upload";
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";

  const claimed = KINDS.find((candidate) => candidate.extensions.includes(ext));
  if (claimed && claimed !== kind) {
    throw new Error(
      `The file is named .${ext} but its contents are a ${kind.label}. ` +
        "Rename it or send the right file.",
    );
  }

  // An unknown extension stays in the stem, so "scan.final" becomes "scan.final.pdf".
  const keptStem = claimed || !ext ? stem : `${stem}.${ext}`;
  const suffix = `.${claimed ? ext : kind.ext}`;

  return `${keptStem.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
};
