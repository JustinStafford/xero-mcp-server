/**
 * Whether attachment tools may reach beyond Xero on a caller's say-so.
 *
 * Both are off unless switched on. On someone's own machine, reading a path they
 * name is the point. On a hosted server it would let a prompt injected through a
 * supplier's bill read or overwrite anything the server's user owns, including
 * its credentials. A URL is the same problem for whatever the host can reach on
 * its network, and a blocklist of private addresses can't see through DNS.
 */
export const localFilesEnabled = (): boolean =>
  process.env.XERO_LOCAL_FILES === "1";

export const fileUrlsEnabled = (): boolean =>
  process.env.XERO_FILE_URLS === "1";

/** The ways this server will accept a file, in words a tool description can use. */
export const describeAttachmentSources = (): string => {
  const sources = [
    localFilesEnabled()
      ? "filePath (a path on the machine running this server)"
      : null,
    fileUrlsEnabled() ? "fileUrl (an https link the server downloads)" : null,
    "fileBase64 (the file's contents, with fileName)",
  ].filter(Boolean);

  const how =
    sources.length === 1
      ? `Supply the file as ${sources[0]}.`
      : `Supply the file in exactly one of these ways: ${sources.join(", ")}.`;

  return `${how} Maximum 3.5MB, which is Xero's limit.`;
};
