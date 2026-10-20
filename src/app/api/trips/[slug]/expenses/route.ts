import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMemberForTrip } from "@/lib/session";
import {
  createSingleExpense,
  ExpenseConflictError,
  ExpenseValidationError,
  TripLockedError,
  TripNotFoundError,
  UnauthorizedError,
} from "@/lib/single-expense";

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

  try {
    const result = await createSingleExpense({
      slug,
      currentMemberId: currentMember.id,
      payload: body,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ExpenseConflictError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 409 },
      );
    }

    if (err instanceof ExpenseValidationError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 400 },
      );
    }

    if (err instanceof TripLockedError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 403 },
      );
    }

    if (err instanceof TripNotFoundError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 404 },
      );
    }

    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "expense_create_failed" },
      { status: 500 },
    );
  }
}
