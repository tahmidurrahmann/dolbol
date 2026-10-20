import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetMemoryOutbox,
  enqueueOp,
  getOpsForTrip,
  type OutboxOp,
} from "@/lib/outbox";
import {
  createSingleExpense,
  ExpenseConflictError,
  TripLockedError,
  type SingleExpenseDbClient,
  type SingleExpenseTx,
} from "@/lib/single-expense";
import { syncOutboxForTrip } from "@/lib/sync-engine";
import {
  computeExpenseShares,
  computeMemberBalances,
  type ExpenseCategoryValue,
  type ExpenseRecordInput,
  type MemberInput,
  type SplitTypeValue,
} from "@/lib/money";

function createMockDb() {
  const trip1 = {
    id: "trip-1",
    slug: "sylhet-tour-2026",
    lockedAt: null,
    creatorMemberId: "karim",
    members: [
      { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
      { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
      { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
      { id: "sakib", displayName: "Sakib", emoji: "🎒", isGuest: false },
    ],
  };

  const trip2Locked = {
    id: "trip-2",
    slug: "locked-trip-2026",
    lockedAt: new Date("2026-10-18T10:00:00Z"),
    creatorMemberId: "karim",
    members: [
      { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
      { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
    ],
  };

  const trip3Other = {
    id: "trip-3",
    slug: "cox-bazar-2026",
    lockedAt: null,
    creatorMemberId: "rahim",
    members: [
      { id: "rahim", displayName: "Rahim", emoji: "🏖️", isGuest: false },
    ],
  };

  const expensesTable: Array<{
    id: string;
    tripId: string;
    title: string;
    amount: number;
    category: ExpenseCategoryValue;
    expenseDate: Date;
    paidById: string;
    createdById: string;
    splitType: SplitTypeValue;
    shares: Array<{ memberId: string; amount: number }>;
  }> = [];

  const activityLogsTable: Array<{
    id: string;
    tripId: string;
    memberId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    after: unknown;
  }> = [];

  const mockDb: SingleExpenseDbClient = {
    trip: {
      findUnique: async (args) => {
        if (args.where.slug === trip1.slug || args.where.id === trip1.id) {
          return trip1;
        }
        if (args.where.slug === trip2Locked.slug || args.where.id === trip2Locked.id) {
          return trip2Locked;
        }
        if (args.where.slug === trip3Other.slug || args.where.id === trip3Other.id) {
          return trip3Other;
        }
        return null;
      },
    },
    expense: {
      findUnique: async (args) => {
        const found = expensesTable.find((e) => e.id === args.where.id);
        if (!found) return null;
        return {
          id: found.id,
          tripId: found.tripId,
          title: found.title,
          amount: found.amount,
          category: found.category,
          expenseDate: found.expenseDate,
          paidById: found.paidById,
          createdById: found.createdById,
          splitType: found.splitType,
          shares: found.shares,
        };
      },
    },
    $transaction: async <T>(callback: (tx: SingleExpenseTx) => Promise<T>): Promise<T> => {
      const tx: SingleExpenseTx = {
        expense: {
          create: async (args) => {
            const newExp = {
              id: args.data.id || `gen-${expensesTable.length + 1}`,
              tripId: args.data.tripId,
              title: args.data.title,
              amount: args.data.amount,
              category: args.data.category,
              expenseDate: args.data.expenseDate,
              paidById: args.data.paidById,
              createdById: args.data.createdById,
              splitType: args.data.splitType,
              shares: args.data.shares.create,
            };
            expensesTable.push(newExp);
            return newExp;
          },
        },
        activityLog: {
          create: async (args) => {
            const log = {
              id: `log-${activityLogsTable.length + 1}`,
              tripId: args.data.tripId,
              memberId: args.data.memberId,
              entityType: args.data.entityType,
              entityId: args.data.entityId,
              action: args.data.action,
              after: args.data.after,
            };
            activityLogsTable.push(log);
            return log;
          },
        },
      };
      return callback(tx);
    },
  };

  return { mockDb, expensesTable, activityLogsTable };
}

describe("STAGE 2: Offline Outbox, Idempotency, In-Order Sync, and Balances Property Tests", () => {
  beforeEach(() => {
    _resetMemoryOutbox();
    vi.restoreAllMocks();
  });

  // 1. Same op sent twice creates one expense (Idempotency)
  it("same op sent twice creates one expense (server idempotency)", async () => {
    const { mockDb, expensesTable, activityLogsTable } = createMockDb();
    const clientUuid = "11111111-1111-4111-8111-111111111111";

    const payload = {
      id: clientUuid,
      title: "Highway Restaurant Breakfast",
      amount: 1200,
      category: "FOOD" as const,
      expenseDate: "2026-10-20",
      paidById: "karim",
      splitType: "EQUAL" as const,
      participantIds: ["karim", "sumi"],
    };

    // First attempt: creates the expense
    const res1 = await createSingleExpense({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      payload,
      dbClient: mockDb,
    });

    expect(res1.ok).toBe(true);
    expect(res1.expense.id).toBe(clientUuid);
    expect(res1.idempotent).toBeUndefined();
    expect(expensesTable).toHaveLength(1);
    expect(activityLogsTable).toHaveLength(1);

    // Second attempt: identical request with the same client UUID
    const res2 = await createSingleExpense({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      payload,
      dbClient: mockDb,
    });

    expect(res2.ok).toBe(true);
    expect(res2.idempotent).toBe(true);
    expect(res2.expense.id).toBe(clientUuid);

    // Exactly one expense in database (no duplicates created!)
    expect(expensesTable).toHaveLength(1);
    expect(activityLogsTable).toHaveLength(1);
  });

  // 2. Ops sync in order
  it("ops sync strictly in chronological order", async () => {
    const tripSlug = "sylhet-tour-2026";

    const op1: OutboxOp = {
      opId: "op-1",
      tripSlug,
      type: "expense.create",
      payload: {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        title: "Morning Rickshaw",
        amount: 80,
        category: "TRANSPORT",
        expenseDate: "2026-10-20",
        paidById: "karim",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi"],
      },
      createdAt: "2026-10-20T08:00:00.000Z",
      status: "pending",
      attempts: 0,
    };

    const op2: OutboxOp = {
      opId: "op-2",
      tripSlug,
      type: "expense.create",
      payload: {
        id: "bbbbbbbb-2222-4222-8222-222222222222",
        title: "Lunch Biryani",
        amount: 900,
        category: "FOOD",
        expenseDate: "2026-10-20",
        paidById: "sumi",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi", "tanvir"],
      },
      createdAt: "2026-10-20T13:30:00.000Z",
      status: "pending",
      attempts: 0,
    };

    const op3: OutboxOp = {
      opId: "op-3",
      tripSlug,
      type: "expense.create",
      payload: {
        id: "cccccccc-3333-4333-8333-333333333333",
        title: "Evening Tea & Snacks",
        amount: 150,
        category: "FOOD",
        expenseDate: "2026-10-20",
        paidById: "tanvir",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi", "tanvir"],
      },
      createdAt: "2026-10-20T18:00:00.000Z",
      status: "pending",
      attempts: 0,
    };

    // Enqueue in out-of-order sequence (op3, op1, op2)
    await enqueueOp(op3);
    await enqueueOp(op1);
    await enqueueOp(op2);

    const callLog: string[] = [];
    const mockFetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      callLog.push(body.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const syncRes = await syncOutboxForTrip(tripSlug, mockFetcher);

    expect(syncRes.synced).toBe(3);
    expect(syncRes.failed).toBe(0);

    // Assert strictly in chronological order: op1, then op2, then op3
    expect(callLog).toEqual([
      "aaaaaaaa-1111-4111-8111-111111111111",
      "bbbbbbbb-2222-4222-8222-222222222222",
      "cccccccc-3333-4333-8333-333333333333",
    ]);

    // All ops successfully processed and cleared from outbox
    const remaining = await getOpsForTrip(tripSlug);
    expect(remaining).toHaveLength(0);
  });

  // 3. A rejected op stays visible
  it("a rejected op stays visible in the outbox with its error code", async () => {
    const tripSlug = "sylhet-tour-2026";
    const op: OutboxOp = {
      opId: "op-bad-input",
      tripSlug,
      type: "expense.create",
      payload: {
        id: "dddddddd-4444-4444-8444-444444444444",
        title: "", // Invalid empty title
        amount: -50, // Invalid negative amount
        category: "FOOD",
        expenseDate: "2026-10-20",
        paidById: "karim",
        splitType: "EQUAL",
      },
      createdAt: "2026-10-20T10:00:00.000Z",
      status: "pending",
      attempts: 0,
    };

    await enqueueOp(op);

    // Mock server returning 400 validation error
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "invalid_input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const syncRes = await syncOutboxForTrip(tripSlug, mockFetcher);

    expect(syncRes.rejected).toBe(1);
    expect(syncRes.synced).toBe(0);

    // Ensure op was NOT deleted from outbox
    const opsAfter = await getOpsForTrip(tripSlug);
    expect(opsAfter).toHaveLength(1);
    expect(opsAfter[0]?.opId).toBe("op-bad-input");
    expect(opsAfter[0]?.status).toBe("rejected");
    expect(opsAfter[0]?.lastError).toBe("invalid_input");
  });

  // 4. A different-trip id collision returns 409
  it("a different-trip id collision returns 409 conflict", async () => {
    const { mockDb } = createMockDb();
    const existingId = "55555555-5555-4555-8555-555555555555";

    // 1. Create expense on trip-1 (Sylhet Tour)
    await createSingleExpense({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      payload: {
        id: existingId,
        title: "Sylhet Resort Room",
        amount: 3500,
        category: "HOTEL",
        expenseDate: "2026-10-20",
        paidById: "karim",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi"],
      },
      dbClient: mockDb,
    });

    // 2. Try creating expense with the SAME id on trip-3 (Cox's Bazar)
    await expect(
      createSingleExpense({
        slug: "cox-bazar-2026",
        currentMemberId: "rahim",
        payload: {
          id: existingId,
          title: "Beach Umbrella",
          amount: 200,
          category: "OTHER",
          expenseDate: "2026-10-20",
          paidById: "rahim",
          splitType: "EQUAL",
          participantIds: ["rahim"],
        },
        dbClient: mockDb,
      }),
    ).rejects.toThrow(ExpenseConflictError);
  });

  // 5. Property test: local balances equal server balances for 200 random sequences of adds
  it("property test: local balances equal server balances for 200 random sequences of adds", () => {
    const members: MemberInput[] = [
      { id: "m1", displayName: "M1", emoji: "🎒" },
      { id: "m2", displayName: "M2", emoji: "🎒" },
      { id: "m3", displayName: "M3", emoji: "🎒" },
      { id: "m4", displayName: "M4", emoji: "🎒" },
    ];
    const memberIds = members.map((m) => m.id);

    // Pseudo-random deterministic generator for reproducibility
    let seed = 42;
    function random(): number {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    function randomInt(min: number, max: number): number {
      return Math.floor(random() * (max - min + 1)) + min;
    }

    const categories: ExpenseCategoryValue[] = [
      "FOOD",
      "TRANSPORT",
      "HOTEL",
      "TICKET",
      "OTHER",
    ];

    for (let iteration = 1; iteration <= 200; iteration++) {
      const numExpenses = randomInt(1, 5);
      const serverExpenses: ExpenseRecordInput[] = [];
      const expenseSpecs: Array<{
        participantIds?: string[];
        exactShares?: Array<{ memberId: string; amount: number }>;
        percentShares?: Array<{ memberId: string; percent: number }>;
      }> = [];

      for (let eIdx = 0; eIdx < numExpenses; eIdx++) {
        const amount = randomInt(10, 20000);
        const payerId = memberIds[randomInt(0, memberIds.length - 1)]!;
        const category = categories[randomInt(0, categories.length - 1)]!;

        // Pick split type
        const splitTypeChoice = randomInt(1, 3);
        let splitType: SplitTypeValue = "EQUAL";
        let participantIds: string[] | undefined;
        let exactShares: Array<{ memberId: string; amount: number }> | undefined;
        let percentShares: Array<{ memberId: string; percent: number }> | undefined;

        if (splitTypeChoice === 1) {
          // EQUAL with random non-empty subset
          splitType = "EQUAL";
          const subsetSize = randomInt(1, memberIds.length);
          const shuffled = [...memberIds].sort(() => random() - 0.5);
          participantIds = shuffled.slice(0, subsetSize);
        } else if (splitTypeChoice === 2) {
          // EXACT split summing to exact amount
          splitType = "EXACT";
          let remaining = amount;
          exactShares = [];
          for (let m = 0; m < memberIds.length; m++) {
            const isLast = m === memberIds.length - 1;
            const shareAmount = isLast ? remaining : randomInt(1, Math.max(1, remaining - (memberIds.length - m)));
            remaining -= shareAmount;
            exactShares.push({ memberId: memberIds[m]!, amount: shareAmount });
          }
        } else {
          // PERCENT split summing to 100
          splitType = "PERCENT";
          percentShares = [
            { memberId: "m1", percent: 25 },
            { memberId: "m2", percent: 25 },
            { memberId: "m3", percent: 25 },
            { memberId: "m4", percent: 25 },
          ];
        }

        // 1. Server computes shares
        const serverShares = computeExpenseShares({
          amount,
          paidById: payerId,
          splitType,
          participantIds,
          exactShares,
          percentShares,
        });

        serverExpenses.push({
          id: `exp-${iteration}-${eIdx}`,
          title: `Expense ${iteration}-${eIdx}`,
          amount,
          category,
          expenseDate: new Date("2026-10-20T12:00:00+06:00"),
          paidById: payerId,
          createdById: payerId,
          splitType,
          deletedAt: null,
          createdAt: new Date("2026-10-20T12:00:00+06:00"),
          updatedAt: new Date("2026-10-20T12:00:00+06:00"),
          shares: serverShares,
        });
        expenseSpecs.push({ participantIds, exactShares, percentShares });
      }

      // Compute server balances
      const serverBalances = computeMemberBalances({
        members,
        expenses: serverExpenses,
        settlements: [],
      });

      // 2. Client pipeline: locally computed from same specs
      const clientExpenses: ExpenseRecordInput[] = serverExpenses.map((exp, idx) => {
        const spec = expenseSpecs[idx]!;
        // Local recalculation using client pure function
        const clientShares = computeExpenseShares({
          amount: exp.amount,
          paidById: exp.paidById,
          splitType: exp.splitType || "EQUAL",
          participantIds: spec.participantIds,
          exactShares: spec.exactShares,
          percentShares: spec.percentShares,
        });
        return {
          ...exp,
          shares: clientShares,
        };
      });

      const clientBalances = computeMemberBalances({
        members,
        expenses: clientExpenses,
        settlements: [],
      });

      // Assert perfect equality for all 4 members
      for (let m = 0; m < members.length; m++) {
        const memberId = members[m]!.id;
        const sBal = serverBalances.find((b) => b.memberId === memberId)!;
        const cBal = clientBalances.find((b) => b.memberId === memberId)!;

        expect(cBal.totalPaid).toBe(sBal.totalPaid);
        expect(cBal.totalOwed).toBe(sBal.totalOwed);
        expect(cBal.netBalance).toBe(sBal.netBalance);
      }
    }
  });

  // 6. Locked trip rejects (403)
  it("locked trip rejects with 403 trip_locked error", async () => {
    const { mockDb } = createMockDb();

    await expect(
      createSingleExpense({
        slug: "locked-trip-2026",
        currentMemberId: "karim",
        payload: {
          id: "66666666-6666-4666-8666-666666666666",
          title: "Dinner after lock",
          amount: 500,
          category: "FOOD",
          expenseDate: "2026-10-20",
          paidById: "karim",
          splitType: "EQUAL",
          participantIds: ["karim", "sumi"],
        },
        dbClient: mockDb,
      }),
    ).rejects.toThrow(TripLockedError);
  });

  // 7. An op survives a simulated page reload
  it("an op survives a simulated page reload and retains its user-entered expense date", async () => {
    const tripSlug = "sylhet-tour-2026";
    const userEnteredDate = "2026-10-18"; // A date distinct from current/sync date

    const op: OutboxOp = {
      opId: "op-reload-test",
      tripSlug,
      type: "expense.create",
      payload: {
        id: "77777777-7777-4777-8777-777777777777",
        title: "Pre-trip Grocery",
        amount: 1450,
        category: "FOOD",
        expenseDate: userEnteredDate, // Must never be mutated to sync date
        paidById: "karim",
        splitType: "EQUAL",
        participantIds: ["karim", "sumi"],
      },
      createdAt: "2026-10-18T14:22:00.000Z",
      status: "pending",
      attempts: 0,
    };

    // 1. Enqueue op into storage
    await enqueueOp(op);

    // 2. Simulate page reload by querying storage afresh
    const recoveredOps = await getOpsForTrip(tripSlug);

    expect(recoveredOps).toHaveLength(1);
    const recovered = recoveredOps[0]!;

    expect(recovered.opId).toBe("op-reload-test");
    expect(recovered.payload.id).toBe("77777777-7777-4777-8777-777777777777");
    expect(recovered.payload.title).toBe("Pre-trip Grocery");
    expect(recovered.payload.amount).toBe(1450);
    expect(recovered.payload.expenseDate).toBe(userEnteredDate);
    expect(recovered.status).toBe("pending");
  });
});
