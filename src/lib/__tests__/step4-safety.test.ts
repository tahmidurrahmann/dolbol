import { describe, expect, it } from "vitest";
import {
  type ActivityLogRecordInput,
  assertTripWritable,
  assertValidExpenseSharesForTrip,
  assertVoteOptionBelongsToTrip,
  extractExpenseEditHistory,
  findDuplicateExpenseCandidate,
  SafetyViolationError,
} from "@/lib/safety";

describe("assertTripWritable — locked trips block every write route", () => {
  it("allows unlocked trips and throws trip_locked on locked trips", () => {
    expect(() => assertTripWritable({ lockedAt: null })).not.toThrow();

    expect(() =>
      assertTripWritable({ lockedAt: new Date("2026-10-16T12:00:00Z") }),
    ).toThrow(SafetyViolationError);
  });
});

describe("assertValidExpenseSharesForTrip — share sum & same-trip member check", () => {
  const validMembers = new Set(["karim", "sumi", "tanvir"]);

  it("passes when all share members belong to trip and sum equals expenseAmount", () => {
    expect(() =>
      assertValidExpenseSharesForTrip({
        expenseAmount: 1000,
        paidById: "karim",
        shares: [
          { memberId: "karim", amount: 334 },
          { memberId: "sumi", amount: 333 },
          { memberId: "tanvir", amount: 333 },
        ],
        validTripMemberIds: validMembers,
      }),
    ).not.toThrow();
  });

  it("throws invalid_shares when share amounts do not add up to expenseAmount", () => {
    expect(() =>
      assertValidExpenseSharesForTrip({
        expenseAmount: 1000,
        paidById: "karim",
        shares: [
          { memberId: "karim", amount: 333 },
          { memberId: "sumi", amount: 333 },
          { memberId: "tanvir", amount: 333 },
        ],
        validTripMemberIds: validMembers,
      }),
    ).toThrow(SafetyViolationError);
  });

  it("throws cross_trip_member when payer or participant belongs to another trip", () => {
    expect(() =>
      assertValidExpenseSharesForTrip({
        expenseAmount: 1000,
        paidById: "outsider",
        shares: [{ memberId: "karim", amount: 1000 }],
        validTripMemberIds: validMembers,
      }),
    ).toThrow(SafetyViolationError);

    expect(() =>
      assertValidExpenseSharesForTrip({
        expenseAmount: 1000,
        paidById: "karim",
        shares: [{ memberId: "outsider", amount: 1000 }],
        validTripMemberIds: validMembers,
      }),
    ).toThrow(SafetyViolationError);
  });
});

describe("assertVoteOptionBelongsToTrip — vote option & member trip check", () => {
  it("passes when member and option both belong to the same trip", () => {
    expect(() =>
      assertVoteOptionBelongsToTrip({
        tripId: "trip-1",
        member: { id: "karim", tripId: "trip-1", isGuest: false },
        option: { id: "opt-cox", tripId: "trip-1" },
      }),
    ).not.toThrow();
  });

  it("rejects when option belongs to a different trip", () => {
    expect(() =>
      assertVoteOptionBelongsToTrip({
        tripId: "trip-1",
        member: { id: "karim", tripId: "trip-1", isGuest: false },
        option: { id: "opt-other", tripId: "trip-2" },
      }),
    ).toThrow(SafetyViolationError);
  });

  it("rejects when a guest or cross-trip member tries to vote", () => {
    expect(() =>
      assertVoteOptionBelongsToTrip({
        tripId: "trip-1",
        member: { id: "guest-1", tripId: "trip-1", isGuest: true },
        option: { id: "opt-cox", tripId: "trip-1" },
      }),
    ).toThrow(SafetyViolationError);
  });
});

describe("findDuplicateExpenseCandidate — duplicate-entry warning", () => {
  const existing = [
    {
      id: "exp-1",
      title: "রাতের খাবার",
      amount: 1200,
      category: "FOOD" as const,
      expenseDate: new Date("2026-10-16T20:00:00+06:00"),
      paidById: "karim",
      deletedAt: null,
    },
    {
      id: "exp-deleted",
      title: "সিএনজি ভাড়া",
      amount: 500,
      category: "TRANSPORT" as const,
      expenseDate: new Date("2026-10-16T15:00:00+06:00"),
      paidById: "sumi",
      deletedAt: new Date("2026-10-16T16:00:00+06:00"),
    },
  ];

  it("warns when same Dhaka day, same amount, and same title or same payer+category", () => {
    // Exact title match on same Dhaka day and amount
    const dupByTitle = findDuplicateExpenseCandidate(
      {
        title: "  রাতের   খাবার ",
        amount: 1200,
        category: "OTHER",
        expenseDate: new Date("2026-10-16T23:00:00+06:00"),
        paidById: "sumi",
      },
      existing,
    );
    expect(dupByTitle?.id).toBe("exp-1");

    // Same payer + category + amount on same Dhaka day
    const dupByPayerCat = findDuplicateExpenseCandidate(
      {
        title: "Dinner at restaurant",
        amount: 1200,
        category: "FOOD",
        expenseDate: new Date("2026-10-16T21:00:00+06:00"),
        paidById: "karim",
      },
      existing,
    );
    expect(dupByPayerCat?.id).toBe("exp-1");
  });

  it("ignores soft-deleted expenses, different days, and self when editing", () => {
    const ignoredDeleted = findDuplicateExpenseCandidate(
      {
        title: "সিএনজি ভাড়া",
        amount: 500,
        category: "TRANSPORT",
        expenseDate: new Date("2026-10-16T15:00:00+06:00"),
        paidById: "sumi",
      },
      existing,
    );
    expect(ignoredDeleted).toBeNull();

    const ignoredSelfOnEdit = findDuplicateExpenseCandidate(
      {
        title: "রাতের খাবার",
        amount: 1200,
        category: "FOOD",
        expenseDate: new Date("2026-10-16T20:00:00+06:00"),
        paidById: "karim",
        excludeExpenseId: "exp-1",
      },
      existing,
    );
    expect(ignoredSelfOnEdit).toBeNull();
  });
});

describe("extractExpenseEditHistory — edit history & post-settlement flagging", () => {
  it("extracts chronological edits and flags edits made after a settlement", () => {
    const logs: ActivityLogRecordInput[] = [
      {
        id: "log-edit-1",
        tripId: "trip-1",
        memberId: "karim",
        entityType: "expense",
        entityId: "exp-1",
        action: "update",
        before: { title: "Hotel", amount: 4000, paidById: "karim" },
        after: { title: "Hotel", amount: 4500, paidById: "karim" },
        createdAt: new Date("2026-10-16T12:00:00+06:00"),
      },
      {
        id: "log-edit-2",
        tripId: "trip-1",
        memberId: "karim",
        entityType: "expense",
        entityId: "exp-1",
        action: "update",
        before: { title: "Hotel", amount: 4500, paidById: "karim" },
        after: { title: "Resort Hotel", amount: 5000, paidById: "sumi" },
        createdAt: new Date("2026-10-16T18:00:00+06:00"),
      },
    ];

    const settlements = [
      {
        createdAt: new Date("2026-10-16T15:00:00+06:00"),
        deletedAt: null,
      },
    ];

    const history = extractExpenseEditHistory({
      expenseId: "exp-1",
      activityLogs: logs,
      settlements,
    });

    expect(history).toHaveLength(2);
    expect(history[0]?.beforeAmount).toBe(4000);
    expect(history[0]?.afterAmount).toBe(4500);
    expect(history[0]?.editedAfterSettlement).toBe(false);

    expect(history[1]?.beforeAmount).toBe(4500);
    expect(history[1]?.afterAmount).toBe(5000);
    expect(history[1]?.editedAfterSettlement).toBe(true);
  });
});
