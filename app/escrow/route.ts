import { NextRequest, NextResponse } from "next/server";

import { createEscrow, getVendorEscrows } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { EscrowCreateSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.escrowRead.limit,
    RATE_LIMITS.escrowRead.windowMs
  );
  if (limited) return limited;

  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const data = await getVendorEscrows(auth.token);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.escrowWrite.limit,
    RATE_LIMITS.escrowWrite.windowMs
  );
  if (limited) return limited;

  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = EscrowCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid escrow payload." },
      { status: 400 }
    );
  }

  const created = await createEscrow(parsed.data, auth.token);
  return NextResponse.json(created, { status: 201 });
}
