import { z } from "zod";

import { getXeroAttachmentUploadLink } from "../../handlers/create-xero-attachment-upload-link.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { UploadLink } from "../../uploads/upload-links.js";

const describeLink = (link: UploadLink): string[] => {
  const head = `Upload link ${link.id} for ${link.target.label}`;

  if (link.status === "open") {
    return [
      head,
      "  Status: WAITING — no file has been attached yet.",
      `  Expires: ${new Date(link.expiresAt).toISOString()}`,
      link.rejected ? `  Files refused so far: ${link.rejected}` : "",
    ];
  }

  if (link.status === "busy") {
    return [head, "  Status: IN PROGRESS — a file is being attached. Ask again shortly."];
  }

  if (link.status === "failed" || !link.outcome) {
    return [
      head,
      `  Status: FAILED — ${link.error ?? "no file was attached."}`,
      "  Nothing was attached through this link. Create a new link to try again.",
    ];
  }

  const { outcome } = link;
  return [
    head,
    "  Status: ATTACHED",
    `  File: ${outcome.fileName}`,
    `  Size: ${outcome.bytes} bytes`,
    `  Type: ${outcome.mimeType}`,
    `  SHA-256: ${outcome.sha256}`,
    outcome.storedOnRecord
      ? "  Stored: the attachment is listed on the record in Xero."
      : "  Stored: NO — Xero accepted the upload but the attachment isn't listed on \
the record. Check it in Xero before relying on it.",
    outcome.contentMatches === true
      ? "  Verified: the file read back from Xero is identical to the one uploaded."
      : outcome.contentMatches === false
        ? "  Verified: NO — the file read back from Xero DIFFERS from the one \
uploaded. Tell the user and check it in Xero."
        : "  Verified: not checked — the file couldn't be read back from Xero to compare.",
  ];
};

const GetAttachmentUploadResultTool = CreateXeroTool(
  "get-attachment-upload-result",
  "Check what happened to a link from create-attachment-upload-link: whether a file \
has been attached yet, and its name, size and SHA-256. Compare those with the file you \
meant to send.",
  {
    linkId: z
      .string()
      .describe("The Link ID that create-attachment-upload-link returned."),
  },
  async ({ linkId }) => {
    const response = getXeroAttachmentUploadLink(linkId);

    return {
      content: [
        {
          type: "text" as const,
          text: response.isError
            ? `Error reading upload link: ${response.error}`
            : describeLink(response.result).filter(Boolean).join("\n"),
        },
      ],
    };
  },
);

export default GetAttachmentUploadResultTool;
