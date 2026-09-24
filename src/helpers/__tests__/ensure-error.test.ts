import { describe, it, expect } from "vitest";
import { ensureError } from "../ensure-error.js";

const SECRET = "Bearer super-secret-token";

function makeSdkRejection(statusCode: number, body?: unknown) {
  return {
    response: {
      statusCode,
      body,
      request: { headers: { authorization: SECRET } },
    },
    request: { headers: { authorization: SECRET } },
  };
}

describe("ensureError", () => {
  it("returns Error instances unchanged", () => {
    const original = new Error("boom");
    expect(ensureError(original)).toBe(original);
  });

  it("does not leak headers from xero-node object rejections", () => {
    const err = ensureError(
      makeSdkRejection(400, {
        problem: { title: "Validation", detail: "Name is required" },
      }),
    );
    expect(err.message).toBe("400 Validation: Name is required");
    expect(err.message).not.toContain(SECRET);
  });

  it("does not leak headers from stringified xero-node rejections", () => {
    const err = ensureError(
      JSON.stringify(
        makeSdkRejection(
          403,
          "<Response><Message>Payroll has not been purchased</Message></Response>",
        ),
      ),
    );
    expect(err.message).toBe("403: Payroll has not been purchased");
    expect(err.message).not.toContain(SECRET);
  });

  it("does not stringify unknown objects", () => {
    const err = ensureError({ headers: { authorization: SECRET } });
    expect(err.message).not.toContain(SECRET);
  });
});
