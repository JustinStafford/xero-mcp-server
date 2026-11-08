import { z } from "zod";

import { fileUrlsEnabled, localFilesEnabled } from "./attachment-access.js";

const allSources = {
  filePath: z
    .string()
    .optional()
    .describe(
      "Absolute path to the file on the machine running this server, e.g. \
'/Users/me/Downloads/supplier-invoice.pdf'.",
    ),
  fileUrl: z
    .string()
    .optional()
    .describe("An https link the server downloads the file from."),
  fileBase64: z
    .string()
    .optional()
    .describe(
      "The file's contents as base64. fileName is required with this option. Comfortable \
up to about 1MB.",
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      "Name to store the file under in Xero. Required with fileBase64; otherwise defaults \
to the file's own name.",
    ),
} as const;

/**
 * The ways a file can reach this server, shared by every attachment tool. A tool
 * only offers the routes this server allows, so an agent is never told about one
 * that would be refused.
 */
export const attachmentSourceSchema = (): typeof allSources => {
  const { filePath, fileUrl, ...always } = allSources;

  return {
    ...(localFilesEnabled() ? { filePath } : {}),
    ...(fileUrlsEnabled() ? { fileUrl } : {}),
    ...always,
  } as typeof allSources;
};

const outputPath = z
  .string()
  .optional()
  .describe(
    "Where to save the file on the machine running this server: either a full path, or \
an existing directory to save it into under its own name. Omit it to get the file in the \
response.",
  );

/** Where a retrieved attachment can go, beyond the tool's response. */
export const attachmentOutputSchema = (): { outputPath: typeof outputPath } =>
  (localFilesEnabled() ? { outputPath } : {}) as {
    outputPath: typeof outputPath;
  };

export const describeAttachmentDelivery = (): string =>
  localFilesEnabled()
    ? "The file comes back in the response, up to 3.5MB, or is saved on the machine running \
this server if you pass outputPath."
    : "The file comes back in the response, up to 3.5MB.";
