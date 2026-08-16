import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { formatError } from "../format-error.js";

function makeAxiosError(status: number, detail?: string): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  const err = new AxiosError(
    "Request failed",
    String(status),
    config as never,
    null,
    {
      status,
      data: detail ? { Detail: detail } : {},
      statusText: "",
      headers: {},
      config,
    } as never,
  );
  return err;
}

describe("formatError", () => {
  describe("AxiosError mapping", () => {
    it("maps 401 to authentication message", () => {
      expect(formatError(makeAxiosError(401))).toBe(
        "Authentication failed. Please check your Xero credentials.",
      );
    });

    it("maps 403 to permission message", () => {
      expect(formatError(makeAxiosError(403))).toBe(
        "You don't have permission to access this resource in Xero.",
      );
    });

    it("maps 404 to not-found message", () => {
      expect(formatError(makeAxiosError(404))).toBe(
        "The requested resource was not found in Xero.",
      );
    });

    it("maps 429 to rate-limit message", () => {
      expect(formatError(makeAxiosError(429))).toBe(
        "Too many requests to Xero. Please try again in a moment.",
      );
    });

    it("returns response.data.Detail for non-mapped statuses", () => {
      expect(formatError(makeAxiosError(400, "Field is required"))).toBe(
        "Field is required",
      );
    });

    it("returns generic message when no Detail is provided", () => {
      expect(formatError(makeAxiosError(500))).toBe(
        "An error occurred while communicating with Xero.",
      );
    });
  });

  describe("xero-node SDK error shape", () => {
    it("extracts problem.detail and title without leaking request headers", () => {
      const sdkError = {
        response: {
          statusCode: 405,
          body: {
            httpStatusCode: "MethodNotAllowed",
            problem: {
              title: "MethodNotAllowed",
              detail: "Method not allowed for the current customer jurisdiction.",
              status: 405,
            },
          },
          headers: { "set-cookie": "ak_bmsc=secret" },
        },
        request: {
          headers: { authorization: "Bearer eyJSECRET" },
        },
      };

      const result = formatError(sdkError);

      expect(result).toBe(
        "405 MethodNotAllowed: Method not allowed for the current customer jurisdiction.",
      );
      expect(result).not.toContain("Bearer");
      expect(result).not.toContain("eyJSECRET");
      expect(result).not.toContain("set-cookie");
    });

    it("maps 401 SDK error to the standard auth message", () => {
      const sdkError = {
        response: { statusCode: 401, body: {} },
        request: { headers: { authorization: "Bearer leaky" } },
      };

      const result = formatError(sdkError);
      expect(result).toBe(
        "Authentication failed. Please check your Xero credentials.",
      );
      expect(result).not.toContain("Bearer");
    });

    it("falls back to status code + title when detail is missing", () => {
      const sdkError = {
        response: {
          statusCode: 502,
          body: { httpStatusCode: "BadGateway" },
        },
      };

      expect(formatError(sdkError)).toBe("502 BadGateway");
    });

    it("falls back to a generic title when neither problem nor httpStatusCode is present", () => {
      const sdkError = { response: { statusCode: 502 } };
      expect(formatError(sdkError)).toBe("502 HTTP error");
    });
  });

  describe("plain Error", () => {
    it("returns the error message", () => {
      expect(formatError(new Error("Employee ID is required"))).toBe(
        "Employee ID is required",
      );
    });
  });

  describe("unknown error shapes", () => {
    it("returns a generic message and never stringifies the object", () => {
      const leakyUnknown = {
        request: { headers: { authorization: "Bearer LEAKY_TOKEN" } },
      };

      const result = formatError(leakyUnknown);

      expect(result).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
      expect(result).not.toContain("Bearer");
      expect(result).not.toContain("LEAKY_TOKEN");
    });

    it("handles string errors safely", () => {
      expect(formatError("something blew up")).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
    });

    it("handles null safely", () => {
      expect(formatError(null)).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
    });
  });
});

describe("stringified payroll errors", () => {
  // The AU payroll API rejects with a JSON string wrapping an XML body.
  const auPayroll403 = JSON.stringify({
    response: {
      statusCode: 403,
      body: '<Response xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><ErrorNumber>0</ErrorNumber><Type>Error</Type><Message>Payroll has not been purchased</Message></Response>',
    },
  });

  it("extracts Xero's own message rather than the generic 403 text", () => {
    expect(formatError(auPayroll403)).toBe("403: Payroll has not been purchased");
  });

  it("falls back to the mapped status when no message is present", () => {
    const noMessage = JSON.stringify({ response: { statusCode: 404, body: "<Response/>" } });
    expect(formatError(noMessage)).toBe("The requested resource was not found in Xero.");
  });

  it("reports an unmapped status rather than a generic failure", () => {
    const teapot = JSON.stringify({ response: { statusCode: 418, body: "<Response/>" } });
    expect(formatError(teapot)).toBe("Xero returned HTTP 418.");
  });

  it("handles an object body carrying Message", () => {
    const objectBody = JSON.stringify({
      response: { statusCode: 400, body: { Message: "Pay run is already posted" } },
    });
    expect(formatError(objectBody)).toBe("400: Pay run is already posted");
  });

  it("ignores non-JSON strings", () => {
    expect(formatError("just a string")).toBe(
      "An unexpected error occurred while communicating with Xero.",
    );
  });

  it("never leaks an authorization header present on the error", () => {
    const withAuth = JSON.stringify({
      response: { statusCode: 403, body: "<Response><Message>Nope</Message></Response>" },
      request: { headers: { authorization: "Bearer super-secret-token" } },
    });
    expect(formatError(withAuth)).not.toContain("super-secret-token");
    expect(formatError(withAuth)).toBe("403: Nope");
  });
});
