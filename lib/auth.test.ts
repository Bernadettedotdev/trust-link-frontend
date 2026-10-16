import { describe, expect, it } from "vitest";

import {
  getBearerToken,
  requireAuth,
  unauthorizedResponse,
  verifyRequestAuth,
} from "@/lib/auth";
import { EXPIRED_JWT, MALFORMED_TOKEN, NO_EXP_JWT, VALID_JWT } from "@/tests/support/jwt";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api", { headers });
}

describe("getBearerToken", () => {
  it("extracts a bearer token", () => {
    expect(getBearerToken(req({ Authorization: `Bearer ${VALID_JWT}` }))).toBe(VALID_JWT);
  });

  it("is case-insensitive on the scheme", () => {
    expect(getBearerToken(req({ Authorization: `bearer ${VALID_JWT}` }))).toBe(VALID_JWT);
  });

  it("returns null for missing, empty and non-bearer values", () => {
    expect(getBearerToken(req())).toBeNull();
    expect(getBearerToken(req({ Authorization: "Bearer " }))).toBeNull();
    expect(getBearerToken(req({ Authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
    expect(getBearerToken(null)).toBeNull();
  });
});

describe("verifyRequestAuth", () => {
  it("accepts a valid, unexpired token", () => {
    const result = verifyRequestAuth(req({ Authorization: `Bearer ${VALID_JWT}` }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.sub).toBe("vendor-test");
    }
  });

  it("accepts a token without an exp claim", () => {
    expect(verifyRequestAuth(req({ Authorization: `Bearer ${NO_EXP_JWT}` })).ok).toBe(true);
  });

  it("rejects a missing token", () => {
    const result = verifyRequestAuth(req());
    expect(result).toEqual({ ok: false, reason: "missing-token" });
  });

  it("rejects a malformed token", () => {
    const result = verifyRequestAuth(req({ Authorization: `Bearer ${MALFORMED_TOKEN}` }));
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects an expired token", () => {
    const result = verifyRequestAuth(req({ Authorization: `Bearer ${EXPIRED_JWT}` }));
    expect(result).toEqual({ ok: false, reason: "expired-token" });
  });
});

describe("requireAuth", () => {
  it("returns the decoded user when authenticated", () => {
    const result = requireAuth(req({ Authorization: `Bearer ${VALID_JWT}` }));
    expect(result.ok).toBe(true);
  });

  it("returns a 401 response when unauthenticated", async () => {
    const result = requireAuth(req());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.message).toMatch(/unauthorized/i);
    }
  });
});

describe("unauthorizedResponse", () => {
  it("sets WWW-Authenticate and a matching message", async () => {
    const response = unauthorizedResponse("invalid-token");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    const body = await response.json();
    expect(body.message).toMatch(/unauthorized|token/i);
  });
});
