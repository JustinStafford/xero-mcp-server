import { z } from "zod";

/**
 * The three ways a file can reach this server, shared by every attachment tool
 * so they behave the same whether the server is local or hosted.
 */
export const attachmentSourceSchema = {
  filePath: z
    .string()
    .optional()
    .describe(
      "Absolute path to the file on the machine running this server, e.g. \
'/Users/me/Downloads/supplier-invoice.pdf'. Only works when the server runs on the same \
machine as the person using it.",
    ),
  fileUrl: z
    .string()
    .optional()
    .describe(
      "An https link the server downloads the file from. Use this when the server is \
hosted and the file is not on its disk.",
    ),
  fileBase64: z
    .string()
    .optional()
    .describe(
      "The file's contents as base64. Use this when the file has no public link. \
fileName is required with this option. Comfortable up to about 1MB; above that use fileUrl.",
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      "Name to store the file under in Xero. Required with fileBase64; otherwise defaults \
to the file's own name.",
    ),
} as const;

export const ATTACHMENT_SOURCE_DESCRIPTION =
  "Supply the file in exactly one of three ways: filePath (a path on the machine running \
this server), fileUrl (an https link the server downloads), or fileBase64 (the file's \
contents, with fileName). Maximum 3.5MB, which is Xero's limit.";
