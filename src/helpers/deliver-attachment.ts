import fs from "node:fs";
import path from "node:path";

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { localFilesEnabled } from "./attachment-access.js";
import { MAX_ATTACHMENT_BYTES } from "./read-attachment-source.js";

export interface DeliveredAttachment {
  bytes: number;
  fileName: string;
  mimeType: string;
  /** Where it was written, when it was saved to disk. */
  savedTo?: string;
  /** The file itself, when it comes back in the tool's response. */
  content?: Buffer;
}

const saveToDisk = (
  body: Buffer,
  fileName: string,
  outputPath: string,
): string => {
  if (!localFilesEnabled()) {
    throw new Error(
      "This server doesn't write files to its own disk. Omit outputPath and the file \
comes back in the response.",
    );
  }

  // Resolve a directory target to a file inside it, so callers can pass either
  // a directory or a full path. basename: the name came from Xero, and anyone
  // who can upload an attachment chooses it.
  let target = path.resolve(outputPath);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, path.basename(fileName));
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return target;
};

/** Save an attachment to the path asked for, or hold it for the response. */
export const deliverAttachment = (
  body: Buffer,
  fileName: string,
  mimeType: string,
  outputPath?: string,
): DeliveredAttachment => {
  if (outputPath) {
    return {
      savedTo: saveToDisk(body, fileName, outputPath),
      bytes: body.length,
      fileName,
      mimeType,
    };
  }

  if (body.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${fileName} is ${(body.length / 1024 / 1024).toFixed(1)}MB, too large to return \
here (the limit is 3.5MB). Open it in Xero instead.`,
    );
  }

  return { content: body, bytes: body.length, fileName, mimeType };
};

const isText = (mimeType: string): boolean =>
  mimeType.startsWith("text/") ||
  ["application/json", "application/xml"].includes(mimeType);

const fileBlock = (
  fileName: string,
  mimeType: string,
  body: Buffer,
): CallToolResult["content"][number] => {
  if (mimeType.startsWith("image/")) {
    return { type: "image", data: body.toString("base64"), mimeType };
  }

  if (isText(mimeType)) {
    return { type: "text", text: body.toString("utf8") };
  }

  return {
    type: "resource",
    resource: {
      uri: `xero-attachment:///${encodeURIComponent(fileName)}`,
      mimeType,
      blob: body.toString("base64"),
    },
  };
};

/** What a get-*-attachment tool returns for a delivered attachment. */
export const deliveredAttachmentContent = (
  delivered: DeliveredAttachment,
  label: string,
): CallToolResult["content"] => {
  const { fileName, bytes, mimeType, savedTo, content } = delivered;

  const summary = {
    type: "text" as const,
    text: [
      `${savedTo ? "Downloaded" : "Retrieved"} ${fileName} from ${label}`,
      savedTo ? `  Saved to: ${savedTo}` : null,
      `  Size: ${bytes} bytes`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  return content ? [summary, fileBlock(fileName, mimeType, content)] : [summary];
};
