import { NextResponse } from "next/server";
import { z } from "zod";
import { NormalizeInputError, parseExpenseTextWithAI } from "@/lib/ai-parser";
import { db } from "@/lib/db";
import { parserRateLimiter } from "@/lib/rate-limit";
import { assertTripWritable } from "@/lib/safety";
import { getCurrentMemberForTrip } from "@/lib/session";

const parseRequestSchema = z.object({
  text: z.string().trim().min(1).max(1500),
});

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const parsedBody = parseRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "trip_not_found" },
      { status: 404 },
    );
  }

  try {
    assertTripWritable(trip);
  } catch {
    return NextResponse.json(
      { ok: false, error: "trip_locked" },
      { status: 403 },
    );
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // Enforce per-trip and per-IP sliding window rate limits (1 parse request per submit)
  const clientIp = extractClientIp(request);
  const rateCheck = parserRateLimiter.checkAndRecord({
    tripId: trip.id,
    ip: clientIp,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        reason: rateCheck.reason,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const result = await parseExpenseTextWithAI({
      rawText: parsedBody.data.text,
      members: trip.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        emoji: m.emoji,
        isGuest: m.isGuest,
      })),
      currentMemberId: currentMember.id,
    });

    // Returns array of items and source ("llm" | "fallback") for Confirm UI
    return NextResponse.json(
      { ok: true, items: result.items, source: result.source },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof NormalizeInputError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "parse_failed" },
      { status: 422 },
    );
  }
}
