/**
 * Shared JWT fixtures for route/rate-limit tests.
 *
 * `jwtDecode` only decodes the payload (it does not verify the signature), so a
 * hand-built token is enough to exercise the auth guards in route handlers.
 */

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeToken(payload: Record<string, unknown>): string {
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  return `${header}.${base64Url(payload)}.test-signature`;
}

/** A syntactically valid token that expires in the far future. */
export const VALID_JWT = makeToken({ sub: "vendor-test", exp: 4102444800 });

/** A syntactically valid token whose `exp` is already in the past. */
export const EXPIRED_JWT = makeToken({ sub: "vendor-test", exp: 1_000_000_000 });

/** A token with no `exp` claim (treated as non-expiring). */
export const NO_EXP_JWT = makeToken({ sub: "vendor-test" });

/** An opaque value that is not a decodable JWT. */
export const MALFORMED_TOKEN = "invalid-token-xyz";

/** Convenience Authorization header for `VALID_JWT`. */
export function authHeader(token: string = VALID_JWT): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
