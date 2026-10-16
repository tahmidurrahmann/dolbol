import { describe, expect, it } from "vitest";
import {
  computeExpenseShares,
  computeMemberBalances,
  type ExpenseRecordInput,
  groupExpensesByDhakaDay,
  isExpenseEditedAfterSettlement,
  type MemberInput,
  type SettlementRecordInput,
  simplifyDebts,
} from "@/lib/money";

const FIVE_MEMBERS: MemberInput[] = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
  { id: "nabila", displayName: "Nabila", emoji: "📸", isGuest: false },
  {
    id: "mamun_guest",
    displayName: "Mamun (Guest)",
    emoji: "👤",
    isGuest: true,
  },
];

describe("computeExpenseShares — 3-way split, subset, guests, exact & percent", () => {
  it("3-way equal split assigns integer rounding leftover to the payer", () => {
    // 100 / 3 = 33 with remainder 1 -> payer (karim) gets 34, sumi & tanvir get 33
    const shares100 = computeExpenseShares({
      amount: 100,
      paidById: "karim",
      splitType: "EQUAL",
      participantIds: ["sumi", "karim", "tanvir"],
    });

    expect(shares100).toEqual([
      { memberId: "sumi", amount: 33 },
      { memberId: "karim", amount: 34 },
      { memberId: "tanvir", amount: 33 },
    ]);

    // 101 / 3 = 33 with remainder 2 -> payer (sumi) gets 35, karim & tanvir get 33
    const shares101 = computeExpenseShares({
      amount: 101,
      paidById: "sumi",
      splitType: "EQUAL",
      participantIds: ["karim", "sumi", "tanvir"],
    });

    expect(shares101).toEqual([
      { memberId: "karim", amount: 33 },
      { memberId: "sumi", amount: 35 },
      { memberId: "tanvir", amount: 33 },
    ]);
  });

  it("handles subset participants including when payer is not in the subset", () => {
    // Karim pays 1000 for a boat shared only by Sumi, Tanvir, and Mamun (Guest)
    const shares = computeExpenseShares({
      amount: 1000,
      paidById: "karim",
      splitType: "EQUAL",
      participantIds: ["sumi", "tanvir", "mamun_guest"],
    });

    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(1000);
    expect(shares).toEqual([
      { memberId: "sumi", amount: 334 },
      { memberId: "tanvir", amount: 333 },
      { memberId: "mamun_guest", amount: 333 },
    ]);
  });

  it("validates EXACT splits and throws when sum does not match expense amount", () => {
    const validExact = computeExpenseShares({
      amount: 2000,
      paidById: "karim",
      splitType: "EXACT",
      exactShares: [
        { memberId: "karim", amount: 800 },
        { memberId: "sumi", amount: 500 },
        { memberId: "tanvir", amount: 700 },
      ],
    });

    expect(validExact).toEqual([
      { memberId: "karim", amount: 800 },
      { memberId: "sumi", amount: 500 },
      { memberId: "tanvir", amount: 700 },
    ]);

    expect(() =>
      computeExpenseShares({
        amount: 2000,
        paidById: "karim",
        splitType: "EXACT",
        exactShares: [
          { memberId: "karim", amount: 800 },
          { memberId: "sumi", amount: 500 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("computes PERCENT splits with integer rounding leftover assigned to payer", () => {
    // 1000 split 33.33%, 33.33%, 33.34% -> floored 333, 333, 333 (sum 999), leftover 1 goes to payer (tanvir)
    const shares = computeExpenseShares({
      amount: 1000,
      paidById: "tanvir",
      splitType: "PERCENT",
      percentShares: [
        { memberId: "karim", percent: 33.33 },
        { memberId: "sumi", percent: 33.33 },
        { memberId: "tanvir", percent: 33.34 },
      ],
    });

    expect(shares).toEqual([
      { memberId: "karim", amount: 333 },
      { memberId: "sumi", amount: 333 },
      { memberId: "tanvir", amount: 334 },
    ]);

    expect(() =>
      computeExpenseShares({
        amount: 1000,
        paidById: "tanvir",
        splitType: "PERCENT",
        percentShares: [
          { memberId: "karim", percent: 50 },
          { memberId: "sumi", percent: 40 },
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe("edit after a settlement", () => {
  it("flags an expense edited after a settlement and recomputes balances on read", () => {
    const members = FIVE_MEMBERS.slice(0, 2); // karim, sumi
    const t0 = new Date("2026-10-16T10:00:00+06:00");
    const tSettle = new Date("2026-10-16T14:00:00+06:00");
    const tEdit = new Date("2026-10-16T18:00:00+06:00");

    // Initially Karim paid 1000 for both (500 each), then Sumi settled 500 at tSettle.
    // Later at tEdit, Karim edited the expense to 1400 (700 each).
    const editedExpense: ExpenseRecordInput = {
      id: "exp-1",
      title: "Hotel",
      amount: 1400,
      category: "HOTEL",
      expenseDate: t0,
      paidById: "karim",
      createdById: "karim",
      splitType: "EQUAL",
      createdAt: t0,
      updatedAt: tEdit,
      shares: computeExpenseShares({
        amount: 1400,
        paidById: "karim",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi"],
      }),
    };

    const settlement: SettlementRecordInput = {
      id: "set-1",
      fromMemberId: "sumi",
      toMemberId: "karim",
      amount: 500,
      createdById: "sumi",
      createdAt: tSettle,
    };

    expect(isExpenseEditedAfterSettlement(editedExpense, [settlement])).toBe(
      true,
    );

    const balances = computeMemberBalances({
      members,
      expenses: [editedExpense],
      settlements: [settlement],
    });

    const karim = balances.find((b) => b.memberId === "karim")!;
    const sumi = balances.find((b) => b.memberId === "sumi")!;

    // Karim paid 1400, owed 700, received 500 settlement -> still owed +200
    expect(karim.netBalance).toBe(200);
    // Sumi paid 0, owed 700, sent 500 settlement -> still owes -200
    expect(sumi.netBalance).toBe(-200);

    expect(simplifyDebts(balances)).toEqual([
      { fromMemberId: "sumi", toMemberId: "karim", amount: 200 },
    ]);
  });
});

describe("5-person, 3-day trip end-to-end balance & per-day view verification", () => {
  it("computes every balance, simplified debt, and per-day Dhaka group to the exact taka", () => {
    const tripStartDate = new Date("2026-10-16T00:00:00+06:00");
    const tripEndDate = new Date("2026-10-18T00:00:00+06:00");
    const createdAt = new Date("2026-10-15T12:00:00+06:00");

    // Pre-trip expense on Oct 14 (should land in "Other dates"):
    // 1) Karim buys advance bus tickets for all 5 (including Mamun Guest): ৳2,500 (500 each)
    const expPreTrip: ExpenseRecordInput = {
      id: "exp-pre",
      title: "Advance Bus Tickets",
      amount: 2500,
      category: "TICKET",
      expenseDate: new Date("2026-10-14T15:00:00+06:00"),
      paidById: "karim",
      createdById: "karim",
      splitType: "EQUAL",
      createdAt,
      updatedAt: createdAt,
      shares: computeExpenseShares({
        amount: 2500,
        paidById: "karim",
        splitType: "EQUAL",
        participantIds: FIVE_MEMBERS.map((m) => m.id),
      }),
    };

    // Day 1 (2026-10-16 in Asia/Dhaka):
    // 2) Sumi pays ৳5,000 for hotel (all 5 share -> 1000 each)
    const expDay1Hotel: ExpenseRecordInput = {
      id: "exp-d1-hotel",
      title: "Resort Check-in",
      amount: 5000,
      category: "HOTEL",
      expenseDate: new Date("2026-10-16T13:00:00+06:00"),
      paidById: "sumi",
      createdById: "sumi",
      splitType: "EQUAL",
      createdAt,
      updatedAt: createdAt,
      shares: computeExpenseShares({
        amount: 5000,
        paidById: "sumi",
        splitType: "EQUAL",
        participantIds: FIVE_MEMBERS.map((m) => m.id),
      }),
    };

    // 3) Tanvir pays ৳100 for tea shared 3-way by Tanvir, Karim, and Mamun Guest
    //    (100 / 3 -> Tanvir gets 34, Karim 33, Mamun 33) at 23:30 Dhaka time (still Day 1 in Dhaka!)
    const expDay1LateTea: ExpenseRecordInput = {
      id: "exp-d1-tea",
      title: "Late Night Tea",
      amount: 100,
      category: "FOOD",
      expenseDate: new Date("2026-10-16T23:30:00+06:00"),
      paidById: "tanvir",
      createdById: "tanvir",
      splitType: "EQUAL",
      createdAt,
      updatedAt: createdAt,
      shares: computeExpenseShares({
        amount: 100,
        paidById: "tanvir",
        splitType: "EQUAL",
        participantIds: ["tanvir", "karim", "mamun_guest"],
      }),
    };

    // Day 2 (2026-10-17 in Asia/Dhaka):
    // 4) Nabila pays ৳2,000 for seafood dinner (EXACT split: Karim 400, Sumi 350, Tanvir 450, Nabila 400, Mamun 400)
    const expDay2Dinner: ExpenseRecordInput = {
      id: "exp-d2-dinner",
      title: "Seafood Dinner",
      amount: 2000,
      category: "FOOD",
      expenseDate: new Date("2026-10-17T20:00:00+06:00"),
      paidById: "nabila",
      createdById: "nabila",
      splitType: "EXACT",
      createdAt,
      updatedAt: createdAt,
      shares: computeExpenseShares({
        amount: 2000,
        paidById: "nabila",
        splitType: "EXACT",
        exactShares: [
          { memberId: "karim", amount: 400 },
          { memberId: "sumi", amount: 350 },
          { memberId: "tanvir", amount: 450 },
          { memberId: "nabila", amount: 400 },
          { memberId: "mamun_guest", amount: 400 },
        ],
      }),
    };

    // Day 3 (2026-10-18 in Asia/Dhaka):
    // 5) Karim pays ৳1,200 for CNG (PERCENT split between Karim 60% = 720 and Tanvir 40% = 480)
    const expDay3Cng: ExpenseRecordInput = {
      id: "exp-d3-cng",
      title: "CNG to Station",
      amount: 1200,
      category: "TRANSPORT",
      expenseDate: new Date("2026-10-18T11:00:00+06:00"),
      paidById: "karim",
      createdById: "karim",
      splitType: "PERCENT",
      createdAt,
      updatedAt: createdAt,
      shares: computeExpenseShares({
        amount: 1200,
        paidById: "karim",
        splitType: "PERCENT",
        percentShares: [
          { memberId: "karim", percent: 60 },
          { memberId: "tanvir", percent: 40 },
        ],
      }),
    };

    const expenses = [
      expPreTrip,
      expDay1Hotel,
      expDay1LateTea,
      expDay2Dinner,
      expDay3Cng,
    ];

    // Settlement: Tanvir pays Sumi back ৳1,000 during the trip
    const settlements: SettlementRecordInput[] = [
      {
        id: "set-tanvir-sumi",
        fromMemberId: "tanvir",
        toMemberId: "sumi",
        amount: 1000,
        createdById: "tanvir",
        createdAt: new Date("2026-10-18T12:00:00+06:00"),
      },
    ];

    const balances = computeMemberBalances({
      members: FIVE_MEMBERS,
      expenses,
      settlements,
    });

    const byId = Object.fromEntries(balances.map((b) => [b.memberId, b]));

    // Verify exact per-member paid, owed, and netBalance to the single taka:
    // Total Trip Spend = 2500 + 5000 + 100 + 2000 + 1200 = 10,800
    // - Karim: paid 2500 + 1200 = 3700; owed 500 + 1000 + 33 + 400 + 720 = 2653 -> net +1047
    expect(byId.karim?.totalPaid).toBe(3700);
    expect(byId.karim?.totalOwed).toBe(2653);
    expect(byId.karim?.netBalance).toBe(1047);

    // - Sumi: paid 5000; owed 500 + 1000 + 0 + 350 + 0 = 1850; received 1000 settlement -> net +2150
    expect(byId.sumi?.totalPaid).toBe(5000);
    expect(byId.sumi?.totalOwed).toBe(1850);
    expect(byId.sumi?.netBalance).toBe(2150);

    // - Tanvir: paid 100; owed 500 + 1000 + 34 + 450 + 480 = 2464; sent 1000 settlement -> net -1364
    expect(byId.tanvir?.totalPaid).toBe(100);
    expect(byId.tanvir?.totalOwed).toBe(2464);
    expect(byId.tanvir?.netBalance).toBe(-1364);

    // - Nabila: paid 2000; owed 500 + 1000 + 0 + 400 + 0 = 1900 -> net +100
    expect(byId.nabila?.totalPaid).toBe(2000);
    expect(byId.nabila?.totalOwed).toBe(1900);
    expect(byId.nabila?.netBalance).toBe(100);

    // - Mamun (Guest): paid 0; owed 500 + 1000 + 33 + 400 + 0 = 1933 -> net -1933
    expect(byId.mamun_guest?.totalPaid).toBe(0);
    expect(byId.mamun_guest?.totalOwed).toBe(1933);
    expect(byId.mamun_guest?.netBalance).toBe(-1933);

    // Conservation of money: sum of all netBalances is strictly 0
    const netSum = balances.reduce((s, b) => s + b.netBalance, 0);
    expect(netSum).toBe(0);

    // Debt simplification:
    // Debtors: mamun_guest (1933), tanvir (1364) -> total 3297
    // Creditors: sumi (2150), karim (1047), nabila (100) -> total 3297
    const simplified = simplifyDebts(balances);
    expect(simplified).toEqual([
      { fromMemberId: "mamun_guest", toMemberId: "sumi", amount: 1933 },
      { fromMemberId: "tanvir", toMemberId: "sumi", amount: 217 },
      { fromMemberId: "tanvir", toMemberId: "karim", amount: 1047 },
      { fromMemberId: "tanvir", toMemberId: "nabila", amount: 100 },
    ]);

    // Per-day Asia/Dhaka grouping check:
    const dayGroupsEn = groupExpensesByDhakaDay({
      expenses,
      members: FIVE_MEMBERS,
      tripStartDate,
      tripEndDate,
      locale: "en",
    });

    expect(dayGroupsEn).toHaveLength(4); // Day 1, Day 2, Day 3, Other dates
    expect(dayGroupsEn[0]?.dayNumber).toBe(1);
    expect(dayGroupsEn[0]?.label).toContain("Day 1 ·");
    expect(dayGroupsEn[0]?.dayTotal).toBe(5100); // 5000 + 100 (23:30 Dhaka time stayed on Day 1!)
    expect(dayGroupsEn[0]?.perPersonCost.tanvir).toBe(1034); // 1000 + 34

    expect(dayGroupsEn[1]?.dayNumber).toBe(2);
    expect(dayGroupsEn[1]?.dayTotal).toBe(2000);

    expect(dayGroupsEn[2]?.dayNumber).toBe(3);
    expect(dayGroupsEn[2]?.dayTotal).toBe(1200);

    expect(dayGroupsEn[3]?.isOtherDates).toBe(true);
    expect(dayGroupsEn[3]?.label).toBe("Other dates");
    expect(dayGroupsEn[3]?.dayTotal).toBe(2500);
  });
});
