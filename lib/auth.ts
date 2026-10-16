/**
 * Server-side authentication helpers for API route handlers.
 *
 * The app stores the wallet session JWT (issued by the backend `/auth/verify`
 * endpoint) in `localStorage` and sends it as `Authorization: Bearer <jwt>`.
 * Route handlers that perform privileged work must check that token before
 * touching the data layer.
 *
 * `jwtDecode` only decodes the payload — it does not verify the signature. That
 * is sufficient here because the browser-facing BFF trusts the backend-issued
 * token and the authoritative check happens when the token is forwarded
 * upstream. The local check exists to reject obviously missing/malformed/expired
 * tokens before any expensive work (rate-limit accounting, ImageResponse CPU,
 * mock-store mutations) is performed.
 */
import { jwtDecode } from "jwt-decode";

export interface AuthPayload {
  /** Subject — the authenticated user/vendor id. */
  sub?: string;
  /** Expiry, in seconds since the epoch. */
  exp?: number;
  [claim: string]: unknown;
}

/** Extracts a non-empty bearer token from a request, or `null`. */
export function getBearerToken(request: Request | null | undefined): string | null {
  const header = request?.headers?.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export type AuthFailureReason =
  | "missing-token"
  | "invalid-token"
  | "expired-token";

export type AuthResult =
  | { ok: true; token: string; user: AuthPayload }
  | { ok: false; reason: AuthFailureReason };

/** Decodes and validates a request's bearer token (structure + expiry). */
export function verifyRequestAuth(request: Request | null | undefined): AuthResult {
  const token = getBearerToken(request);
  if (!token) return { ok: false, reason: "missing-token" };

  let payload: AuthPayload;
  try {
    payload = jwtDecode<AuthPayload>(token);
  } catch {
    return { ok: false, reason: "invalid-token" };
  }

  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired-token" };
  }

  return { ok: true, token, user: payload };
}

/** Builds the 401 response returned when auth fails. */
export function unauthorizedResponse(reason: AuthFailureReason): Response {
  const message =
    reason === "missing-token"
      ? "Unauthorized: missing bearer token."
      : reason === "expired-token"
        ? "Unauthorized: token expired."
        : "Unauthorized: invalid bearer token.";

  return new Response(JSON.stringify({ message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
    },
  });
}

/**
 * Convenience guard for route handlers: returns `{ ok: false, response }` with a
 * ready-to-return 401 when the request is unauthenticated, or the decoded user
 * when it is authenticated.
 */
export function requireAuth(
  request: Request | null | undefined
): { ok: true; token: string; user: AuthPayload } | { ok: false; response: Response } {
  const result = verifyRequestAuth(request);
  if (!result.ok) {
    return { ok: false, response: unauthorizedResponse(result.reason) };
  }
  return { ok: true, token: result.token, user: result.user };
}
