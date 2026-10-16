import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<{ ok: boolean }>> {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    // Never leak internal database error details to clients
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
