import { NextResponse } from "next/server";
import { undoBatchExpenses } from "@/lib/batch-expenses";
import { db } from "@/lib/db";
import { getCurrentMemberForTrip } from "@/lib/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;

  const trip = await db.trip.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "trip_not_found" },
      { status: 404 },
    );
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const batchId =
    body && typeof body === "object" && "batchId" in body
      ? String((body as { batchId: unknown }).batchId).trim()
      : "";

  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: "batch_id_required" },
      { status: 400 },
    );
  }

  try {
    const result = await undoBatchExpenses({
      slug,
      currentMemberId: currentMember.id,
      batchId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "trip_not_found") {
        return NextResponse.json(
          { ok: false, error: "trip_not_found" },
          { status: 404 },
        );
      }
      if (err.message === "trip_locked") {
        return NextResponse.json(
          { ok: false, error: "trip_locked" },
          { status: 403 },
        );
      }
      if (err.message === "unauthorized") {
        return NextResponse.json(
          { ok: false, error: "unauthorized" },
          { status: 401 },
        );
      }
    }

    return NextResponse.json(
      { ok: false, error: "undo_failed" },
      { status: 500 },
    );
  }
}
