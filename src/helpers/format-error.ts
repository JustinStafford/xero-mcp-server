import { AxiosError } from "axios";

interface XeroSdkProblem {
  title?: string;
  detail?: string;
  status?: number;
}

interface XeroSdkError {
  response: {
    statusCode: number;
    body?: {
      httpStatusCode?: string;
      problem?: XeroSdkProblem;
      Detail?: string;
    };
  };
}

function isXeroSdkError(error: unknown): error is XeroSdkError {
  if (typeof error !== "object" || error === null) return false;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return false;
  return typeof (response as { statusCode?: unknown }).statusCode === "number";
}

function formatHttpStatus(status: number): string {
  switch (status) {
    case 401:
      return "Authentication failed. Please check your Xero credentials.";
    case 403:
      return "You don't have permission to access this resource in Xero.";
    case 404:
      return "The requested resource was not found in Xero.";
    case 429:
      return "Too many requests to Xero. Please try again in a moment.";
    default:
      return "";
  }
}

/**
 * The AU payroll API rejects with a JSON *string* whose body is XML, rather
 * than the object shape the accounting endpoints use. Left unhandled it falls
 * through to the generic message, which turns an actionable failure such as
 * "Payroll has not been purchased" into "An unexpected error occurred".
 */
function parseStringifiedError(
  error: unknown,
): { status?: number; message?: string } | null {
  if (typeof error !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(error);
  } catch {
    return null;
  }

  const response = (parsed as { response?: unknown })?.response;
  if (typeof response !== "object" || response === null) return null;

  const status = (response as { statusCode?: unknown }).statusCode;
  const body = (response as { body?: unknown }).body;

  // Whitelist extraction only — the surrounding object carries the caller's
  // bearer token in `request.headers.authorization`.
  let message: string | undefined;
  if (typeof body === "string") {
    message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1]?.trim();
  } else if (typeof body === "object" && body !== null) {
    const detail = (body as { Detail?: unknown; Message?: unknown });
    if (typeof detail.Message === "string") message = detail.Message;
    else if (typeof detail.Detail === "string") message = detail.Detail;
  }

  return {
    status: typeof status === "number" ? status : undefined,
    message: message || undefined,
  };
}

/**
 * Format error messages for return to the LLM.
 *
 * Never stringify unknown error objects — the xero-node SDK rejects with a
 * plain object whose `request.headers.authorization` field contains the
 * caller's Bearer token. Whitelist the fields we extract so secrets never
 * reach the response.
 */
export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const detail = error.response?.data?.Detail;

    if (status !== undefined) {
      const mapped = formatHttpStatus(status);
      if (mapped) return mapped;
    }
    return detail || "An error occurred while communicating with Xero.";
  }

  if (isXeroSdkError(error)) {
    const status = error.response.statusCode;
    const mapped = formatHttpStatus(status);
    if (mapped) return mapped;

    const body = error.response.body;
    const problem = body?.problem;
    const title = problem?.title ?? body?.httpStatusCode ?? "HTTP error";
    const detail = problem?.detail ?? body?.Detail;
    return detail ? `${status} ${title}: ${detail}` : `${status} ${title}`;
  }

  const stringified = parseStringifiedError(error);
  if (stringified) {
    // Prefer Xero's own wording: a payroll 403 means "not purchased", not
    // "you lack permission", and the generic status text would mislead.
    if (stringified.message) {
      return stringified.status
        ? `${stringified.status}: ${stringified.message}`
        : stringified.message;
    }
    if (stringified.status !== undefined) {
      const mapped = formatHttpStatus(stringified.status);
      if (mapped) return mapped;
      return `Xero returned HTTP ${stringified.status}.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while communicating with Xero.";
}
