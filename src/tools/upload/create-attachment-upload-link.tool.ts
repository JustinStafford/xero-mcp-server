import { z } from "zod";

import { createXeroAttachmentUploadLink } from "../../handlers/create-xero-attachment-upload-link.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { ACCEPTED_KINDS } from "../../uploads/file-type.js";
import { describeMaxBytes } from "../../uploads/upload-config.js";

const CreateAttachmentUploadLinkTool = CreateXeroTool(
  "create-attachment-upload-link",
  `Make a one-time link for attaching a file to a bill, an invoice or a bank \
transaction, so the file goes straight to this server and you never encode its \
contents. Prefer this to fileBase64 for any real file. The link is tied to the one \
record named here, works once and expires in minutes. Send the file to it (see the \
response for how), then call get-attachment-upload-result. Accepts ${ACCEPTED_KINDS}.`,
  {
    attachTo: z
      .enum(["invoice", "bank-transaction"])
      .describe(
        "What kind of record the file goes on. 'invoice' covers bills too: in Xero a \
bill and a sales invoice are both invoices.",
      ),
    recordId: z
      .string()
      .describe(
        "The record. For an invoice or bill: its number (e.g. 'INV-0042') or Xero \
invoice ID. For a bank transaction: its Xero bank transaction ID.",
      ),
    includeOnline: z
      .boolean()
      .optional()
      .describe(
        "Optional, sales invoices only. Also show the file on the online invoice the \
CUSTOMER sees. Defaults to false. Only set true when the user has asked for that.",
      ),
  },
  async ({ attachTo, recordId, includeOnline }) => {
    const response = await createXeroAttachmentUploadLink(
      attachTo,
      recordId,
      includeOnline ?? false,
    );

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating upload link: ${response.error}`,
          },
        ],
      };
    }

    const { link, url, config, alreadyAttached } = response.result;
    const minutes = Math.round(config.ttlMs / 60000);

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Upload link for ${link.target.label}`,
            `  URL: ${url}`,
            `  Link ID: ${link.id}`,
            `  Expires: ${new Date(link.expiresAt).toISOString()} (${minutes} minutes), works once`,
            `  Accepts: one ${ACCEPTED_KINDS} file up to ${describeMaxBytes(config.maxBytes)}`,
            `  Already attached to this record: ${alreadyAttached.join(", ") || "nothing"}`,
            "",
            "Send the file without reading or encoding it yourself:",
            "  - If you can run a shell command where the file is (a code sandbox, a terminal):",
            `      curl -sS -F "file=@/path/to/the-file.pdf" "${url}"`,
            "  - Otherwise give the user the URL to open in a browser and choose the file.",
            "Then call get-attachment-upload-result with the link ID and check the file \
name, size and SHA-256 it reports.",
            "The URL is a secret: anyone holding it can attach one file to this record. \
Share it only with the user.",
          ].join("\n"),
        },
      ],
    };
  },
);

export default CreateAttachmentUploadLinkTool;
