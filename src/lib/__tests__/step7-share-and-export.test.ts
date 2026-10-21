import { describe, expect, it } from "vitest";
import { computeExpenseShares, type MemberInput } from "@/lib/money";
import {
  buildDailyCostSheetData,
  buildPublicTripSummary,
  generateDailyCostSheetCsv,
  generateDailyCostSheetHtml,
} from "@/lib/share-and-export";

const MEMBERS: MemberInput[] = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
];

describe("buildPublicTripSummary — public read-only summary (no money details)", () => {
  it("includes trip metadata, members, leading destination vote, and itinerary without any money fields", () => {
    const summary = buildPublicTripSummary({
      slug: "AbCdEfGhIjKlMnOpQrStUv",
      name: "সুন্দরবন ট্যুর ২০২৬",
      destination: "সুন্দরবন",
      startDate: new Date("2026-10-16T00:00:00+06:00"),
      endDate: new Date("2026-10-18T00:00:00+06:00"),
      members: MEMBERS,
      options: [
        {
          id: "opt-1",
          tripId: "t1",
          name: "সুন্দরবন",
          proposedById: "karim",
          createdAt: new Date("2026-10-15T10:00:00Z"),
        },
      ],
      votes: [
        { id: "v1", tripId: "t1", memberId: "karim", optionId: "opt-1" },
        { id: "v2", tripId: "t1", memberId: "sumi", optionId: "opt-1" },
      ],
      itinerary: [
        {
          id: "it-1",
          tripId: "t1",
          dayNumber: 1,
          time: "08:30",
          title: "খুলনা থেকে লঞ্চে যাত্রা",
          notes: null,
          position: 1,
          createdById: "karim",
          createdAt: new Date("2026-10-15T10:00:00Z"),
        },
      ],
      locale: "bn",
    });

    expect(summary.name).toBe("সুন্দরবন ট্যুর ২০২৬");
    expect(summary.topVotedDestination).toBe("সুন্দরবন");
    expect(summary.memberCount).toBe(3);
    expect(summary.itineraryDays).toHaveLength(1);

    // Verify no money keys exist on the public summary object
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("totalTripSpend");
    expect(serialized).not.toContain("netBalance");
    expect(serialized).not.toContain("simplifiedDebts");
    expect(serialized).not.toContain("expenses");
  });
});

describe("buildDailyCostSheetData & CSV/HTML export", () => {
  it("generates CSV with UTF-8 BOM, per-day totals, per-person totals, and who owes whom", () => {
    const t0 = new Date("2026-10-16T12:00:00+06:00");
    const expenses = [
      {
        id: "exp-1",
        title: "Resort Booking",
        amount: 3000,
        category: "HOTEL" as const,
        expenseDate: t0,
        paidById: "karim",
        createdById: "karim",
        splitType: "EQUAL" as const,
        createdAt: t0,
        updatedAt: t0,
        shares: computeExpenseShares({
          amount: 3000,
          paidById: "karim",
          splitType: "EQUAL",
          participantIds: ["karim", "sumi", "tanvir"],
        }),
      },
      {
        id: "exp-2",
        title: "Launch Tickets",
        amount: 1500,
        category: "TICKET" as const,
        expenseDate: new Date("2026-10-17T09:00:00+06:00"),
        paidById: "sumi",
        createdById: "sumi",
        splitType: "EQUAL" as const,
        createdAt: t0,
        updatedAt: t0,
        shares: computeExpenseShares({
          amount: 1500,
          paidById: "sumi",
          splitType: "EQUAL",
          participantIds: ["karim", "sumi", "tanvir"],
        }),
      },
    ];

    const sheet = buildDailyCostSheetData({
      tripName: "Sundarbans Tour",
      destination: "Khulna",
      tripStartDate: new Date("2026-10-16T00:00:00+06:00"),
      tripEndDate: new Date("2026-10-18T00:00:00+06:00"),
      members: MEMBERS,
      expenses,
      settlements: [],
      locale: "en",
    });

    expect(sheet.totalTripSpend).toBe(4500);
    expect(sheet.dayGroups).toHaveLength(2);
    expect(sheet.dayGroups[0]?.dayTotal).toBe(3000);
    expect(sheet.dayGroups[1]?.dayTotal).toBe(1500);

    // Karim paid 3000, share 1500 -> +1500
    // Sumi paid 1500, share 1500 -> 0
    // Tanvir paid 0, share 1500 -> -1500 (owes Karim 1500)
    expect(sheet.simplifiedDebts).toEqual([
      { fromMemberId: "tanvir", toMemberId: "karim", amount: 1500 },
    ]);

    const csv = generateDailyCostSheetCsv(sheet, "en");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Total Trip Spend (BDT),4500");
    expect(csv).toContain("Tanvir,Karim,1500");
    expect(csv).toContain("Resort Booking,HOTEL,Karim,3000");

    const html = generateDailyCostSheetHtml({
      sheet,
      slug: "AbCdEfGhIjKlMnOpQrStUv",
      locale: "en",
      categoryLabels: {
        TRANSPORT: "Transport",
        HOTEL: "Stay",
        FOOD: "Food",
        TICKET: "Tickets",
        OTHER: "Other",
      },
    });
    expect(html).toContain("Sundarbans Tour");
    expect(html).toContain("৳4,500");
    expect(html).toContain("Tanvir");
  });
});
