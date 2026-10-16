import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { SupportedLocale } from "@/lib/format";
import type {
  ExpenseCategoryValue,
  ExpenseRecordInput,
  MemberInput,
  SettlementRecordInput,
  SplitTypeValue,
} from "@/lib/money";
import { getCurrentMemberForTrip } from "@/lib/session";
import {
  buildDailyCostSheetData,
  generateDailyCostSheetCsv,
  generateDailyCostSheetHtml,
} from "@/lib/share-and-export";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "html" ? "html" : "csv";

  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
      expenses: {
        where: { deletedAt: null },
        include: { shares: true },
        orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
      },
      settlements: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: "trip_not_found" }, { status: 404 });
  }

  // Require an active trip member session so private money details are only downloadable by trip members
  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const locale = (await getLocale()) as SupportedLocale;
  const tMoney = await getTranslations("money");

  const memberInputs: MemberInput[] = trip.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    emoji: m.emoji,
    isGuest: m.isGuest,
  }));

  const expenseInputs: ExpenseRecordInput[] = trip.expenses.map((e) => ({
    id: e.id,
    title: e.title,
    amount: e.amount,
    category: e.category as ExpenseCategoryValue,
    expenseDate: e.expenseDate,
    paidById: e.paidById,
    createdById: e.createdById,
    splitType: e.splitType as SplitTypeValue,
    note: e.note,
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      amount: s.amount,
    })),
  }));

  const settlementInputs: SettlementRecordInput[] = trip.settlements.map(
    (s) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: s.amount,
      createdById: s.createdById,
      deletedAt: s.deletedAt,
      createdAt: s.createdAt,
    }),
  );

  const sheetData = buildDailyCostSheetData({
    tripName: trip.name,
    destination: trip.destination,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    members: memberInputs,
    expenses: expenseInputs,
    settlements: settlementInputs,
    locale,
    otherDatesLabel: tMoney("otherDatesLabel"),
  });

  if (format === "html") {
    const html = generateDailyCostSheetHtml({
      sheet: sheetData,
      slug: trip.slug,
      locale,
      categoryLabels: {
        TRANSPORT: tMoney("cat_TRANSPORT"),
        HOTEL: tMoney("cat_HOTEL"),
        FOOD: tMoney("cat_FOOD"),
        TICKET: tMoney("cat_TICKET"),
        OTHER: tMoney("cat_OTHER"),
      },
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  const csvContent = generateDailyCostSheetCsv(sheetData, locale);
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trip-cost-sheet-${trip.slug}.csv"`,
    },
  });
}
