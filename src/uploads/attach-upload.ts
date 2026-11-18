import { createHash } from "node:crypto";

import { tenantContext } from "../clients/tenant-context.js";
import { xeroClient } from "../clients/xero-client.js";
import { addXeroBankTransactionAttachment } from "../handlers/add-xero-bank-transaction-attachment.handler.js";
import { addXeroInvoiceAttachment } from "../handlers/add-xero-invoice-attachment.handler.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AttachmentPayload } from "../helpers/read-attachment-source.js";
import { UploadLink, UploadOutcome } from "./upload-links.js";

export const sha256Hex = (body: Buffer): string =>
  createHash("sha256").update(body).digest("hex");

/** Download what Xero stored and compare it with what was sent. */
const readBackMatches = async (
  link: UploadLink,
  attachmentId: string,
  mimeType: string,
  sha256: string,
): Promise<boolean | null> => {
  try {
    const response =
      link.target.kind === "invoice"
        ? await xeroClient.accountingApi.getInvoiceAttachmentById(
            xeroClient.tenantId,
            link.target.id,
            attachmentId,
            mimeType,
            getClientHeaders(),
          )
        : await xeroClient.accountingApi.getBankTransactionAttachmentById(
            xeroClient.tenantId,
            link.target.id,
            attachmentId,
            mimeType,
            getClientHeaders(),
          );

    return Buffer.isBuffer(response.body)
      ? sha256Hex(response.body) === sha256
      : null;
  } catch {
    // The attachment is stored either way; "couldn't check" is reported as such.
    return null;
  }
};

/**
 * Attach an uploaded file to the record its link was made for, then read it
 * back from Xero and compare hashes.
 *
 * Runs in the link's own organisation, fixed when the link was created: the
 * upload request carries nothing that could choose another.
 */
export const attachUpload = (
  link: UploadLink,
  payload: AttachmentPayload,
  mimeType: string,
): Promise<UploadOutcome> =>
  tenantContext.run(
    { tenantId: link.tenantId, tenantName: link.tenantName },
    async () => {
      const response =
        link.target.kind === "invoice"
          ? await addXeroInvoiceAttachment(
              link.target.id,
              payload,
              link.target.includeOnline,
            )
          : await addXeroBankTransactionAttachment(link.target.id, payload);

      if (response.isError) {
        throw new Error(response.error);
      }

      const { attachment, verified } = response.result;
      const sha256 = sha256Hex(payload.body);

      return {
        fileName: attachment.fileName ?? payload.name,
        bytes: payload.body.length,
        sha256,
        mimeType: attachment.mimeType ?? mimeType,
        storedOnRecord: verified,
        contentMatches: attachment.attachmentID
          ? await readBackMatches(
              link,
              attachment.attachmentID,
              attachment.mimeType ?? mimeType,
              sha256,
            )
          : null,
      };
    },
  );
