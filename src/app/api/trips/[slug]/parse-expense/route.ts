import { NextResponse } from "next/server";
import { z } from "zod";
import { parseExpenseTextWithAI } from "@/lib/ai-parser";
import { db } from "@/lib/db";
import { parserRateLimiter } from "@/lib/rate-limit";
import { assertTripWritable } from "@/lib/safety";
import { getCurrentMemberForTrip } from "@/lib/session";

const parseRequestSchema = z.object({
  text: z.string().trim().min(2).max(500),
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

  // Enforce per-trip and per-IP sliding window rate limits
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
    const draft = await parseExpenseTextWithAI({
      rawText: parsedBody.data.text,
      members: trip.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        emoji: m.emoji,
        isGuest: m.isGuest,
      })),
      currentMemberId: currentMember.id,
    });

    // Returns the parsed draft ONLY for the Confirm Card — never auto-saves to DB
    return NextResponse.json({ ok: true, draft }, { status: 200 });
  } catch (err) {
    const code =
      err instanceof Error && err.message === "missing_amount"
        ? "missing_amount"
        : "parse_failed";
    return NextResponse.json({ ok: false, error: code }, { status: 422 });
  }
}
