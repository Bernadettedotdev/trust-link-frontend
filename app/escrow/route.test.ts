import { beforeEach, describe, expect, it, vi } from "vitest";

import { authHeader } from "@/tests/support/jwt";

import { GET } from "./route";

vi.mock("@/lib/api", () => ({
  getVendorEscrows: vi.fn(),
  createEscrow: vi.fn(),
}));

vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return { ...actual, enforceRateLimit: vi.fn().mockResolvedValue(null) };
});

import { getVendorEscrows } from "@/lib/api";

describe("GET /api/escrow", () => {
  beforeEach(() => {
    vi.mocked(getVendorEscrows).mockReset();
  });

  it("returns escrow items with a 200 status", async () => {
    const escrowItems = [
      { escrowId: "escrow-1", vendor: "Alliance Logistics", orders: 24, status: "Ready" },
    ];
    // Changed to mockResolvedValue because the real API functions are asynchronous
    vi.mocked(getVendorEscrows).mockResolvedValue(escrowItems as never);

    const response = await GET(
      new Request("https://test.local/escrow", { headers: authHeader() })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(escrowItems);
  });

  it("returns 401 without a bearer token", async () => {
    const response = await GET(new Request("https://test.local/escrow"));
    expect(response.status).toBe(401);
    expect(getVendorEscrows).not.toHaveBeenCalled();
  });
});
