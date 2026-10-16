import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { shipEscrow } from "@/lib/escrowStore";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

const ShipEscrowSchema = z
  .object({
    // `preprocess` maps a missing/non-string value to "" so the failure surfaces
    // the user-facing "required" message instead of zod's type error.
    trackingId: z.preprocess(
      (value) => (value === undefined || value === null ? "" : value),
      z
        .string()
        .trim()
        .min(1, "Tracking ID is required.")
        .max(64, "Tracking ID must be 64 characters or less.")
    ),
    carrier: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.escrowWrite.limit,
    RATE_LIMITS.escrowWrite.windowMs
  );
  if (limited) return limited;

  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = ShipEscrowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    const shippedItem = shipEscrow(
      id,
      parsed.data.trackingId,
      parsed.data.carrier ?? "Other"
    );
    return NextResponse.json(shippedItem);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to ship escrow." },
      { status: 404 }
    );
  }
}
