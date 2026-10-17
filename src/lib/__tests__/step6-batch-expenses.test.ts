import { describe, expect, it } from "vitest";
import {
  BatchValidationError,
  saveBatchExpenses,
  undoBatchExpenses,
} from "@/lib/batch-expenses";

describe("Batch expenses — all-or-nothing database transaction and undo", () => {
  function createMockDb() {
    const trip = {
      id: "trip-1",
      slug: "sylhet-tour-2026",
      name: "Sylhet Tour",
      lockedAt: null,
      creatorMemberId: "karim",
      members: [
        { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
        { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
        { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
      ],
    };

    const expensesTable: Array<{
      id: string;
      tripId: string;
      title: string;
      amount: number;
      category: string;
      expenseDate: Date;
      paidById: string;
      createdById: string;
      splitType: string;
      deletedAt: Date | null;
    }> = [];

    const sharesTable: Array<{
      id: string;
      expenseId: string;
      memberId: string;
      amount: number;
    }> = [];

    const settlementsTable: Array<{
      id: string;
      tripId: string;
      fromMemberId: string;
      toMemberId: string;
      amount: number;
      createdById: string;
      deletedAt: Date | null;
    }> = [];

    const activityLogsTable: Array<{
      id: string;
      tripId: string;
      memberId: string;
      entityType: string;
      entityId: string;
      action: string;
      before: unknown;
      after: unknown;
    }> = [];

    const mockDb = {
      trip: {
        findUnique: async (args: { where: { slug?: string; id?: string } }) => {
          if (args.where.slug === trip.slug || args.where.id === trip.id) {
            return trip;
          }
          return null;
        },
      },
      activityLog: {
        findMany: async (args: { where: { tripId: string; action: string } }) => {
          return activityLogsTable.filter(
            (l) =>
              l.tripId === args.where.tripId && l.action === args.where.action,
          );
        },
      },
      $transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
        // Snapshot for rollback on failure
        const snapExpenses = [...expensesTable];
        const snapShares = [...sharesTable];
        const snapSettlements = [...settlementsTable];
        const snapLogs = [...activityLogsTable];

        const tx = {
          expense: {
            create: async (args: { data: any }) => {
              const id = `exp-${expensesTable.length + 1}`;
              const record = {
                id,
                tripId: args.data.tripId,
                title: args.data.title,
                amount: args.data.amount,
                category: args.data.category,
                expenseDate: args.data.expenseDate,
                paidById: args.data.paidById,
                createdById: args.data.createdById,
                splitType: args.data.splitType,
                deletedAt: null,
              };
              expensesTable.push(record);
              if (args.data.shares?.create) {
                for (const s of args.data.shares.create) {
                  sharesTable.push({
                    id: `share-${sharesTable.length + 1}`,
                    expenseId: id,
                    memberId: s.memberId,
                    amount: s.amount,
                  });
                }
              }
              return record;
            },
            updateMany: async (args: { where: { id: { in: string[] } }; data: any }) => {
              let count = 0;
              for (const e of expensesTable) {
                if (args.where.id.in.includes(e.id) && !e.deletedAt) {
                  e.deletedAt = args.data.deletedAt;
                  count++;
                }
              }
              return { count };
            },
          },
          settlement: {
            create: async (args: { data: any }) => {
              const id = `set-${settlementsTable.length + 1}`;
              const record = {
                id,
                tripId: args.data.tripId,
                fromMemberId: args.data.fromMemberId,
                toMemberId: args.data.toMemberId,
                amount: args.data.amount,
                createdById: args.data.createdById,
                deletedAt: null,
              };
              settlementsTable.push(record);
              return record;
            },
            updateMany: async (args: { where: { id: { in: string[] } }; data: any }) => {
              let count = 0;
              for (const s of settlementsTable) {
                if (args.where.id.in.includes(s.id) && !s.deletedAt) {
                  s.deletedAt = args.data.deletedAt;
                  count++;
                }
              }
              return { count };
            },
          },
          activityLog: {
            create: async (args: { data: any }) => {
              const id = `log-${activityLogsTable.length + 1}`;
              const record = {
                id,
                tripId: args.data.tripId,
                memberId: args.data.memberId,
                entityType: args.data.entityType,
                entityId: args.data.entityId,
                action: args.data.action,
                before: args.data.before ?? null,
                after: args.data.after ?? null,
              };
              activityLogsTable.push(record);
              return record;
            },
          },
        };

        try {
          return await callback(tx);
        } catch (err) {
          // Rollback state
          expensesTable.length = 0;
          expensesTable.push(...snapExpenses);
          sharesTable.length = 0;
          sharesTable.push(...snapShares);
          settlementsTable.length = 0;
          settlementsTable.push(...snapSettlements);
          activityLogsTable.length = 0;
          activityLogsTable.push(...snapLogs);
          throw err;
        }
      },
    };

    return {
      mockDb: mockDb as any,
      expensesTable,
      sharesTable,
      settlementsTable,
      activityLogsTable,
    };
  }

  it("creates all expenses, shares, and activity logs in ONE atomic transaction with shared batchId", async () => {
    const { mockDb, expensesTable, sharesTable, activityLogsTable } =
      createMockDb();

    const items = [
      {
        title: "rater khabar",
        amount: 1200,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "karim",
        participantIds: ["karim", "sumi", "tanvir"],
        splitType: "EQUAL",
      },
      {
        title: "shokaler nasta",
        amount: 200,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "sumi",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
      {
        title: "DUPURER khabar",
        amount: 600,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "tanvir",
        participantIds: ["karim", "sumi", "tanvir"],
        splitType: "EQUAL",
      },
    ];

    const result = await saveBatchExpenses({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      items,
      dbClient: mockDb,
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
    expect(result.expenseIds).toHaveLength(3);
    expect(result.batchId).toBeDefined();

    // Verify 3 expenses created in table
    expect(expensesTable).toHaveLength(3);
    expect(expensesTable[0]?.title).toBe("rater khabar");
    expect(expensesTable[0]?.amount).toBe(1200);

    // Verify shares created
    // Item 1: 1200 / 3 = 400 each (karim, sumi, tanvir)
    const exp1Shares = sharesTable.filter((s) => s.expenseId === result.expenseIds[0]);
    expect(exp1Shares).toHaveLength(3);
    expect(exp1Shares.reduce((sum, s) => sum + s.amount, 0)).toBe(1200);

    // Item 2: 200 / 2 = 100 each (karim, sumi)
    const exp2Shares = sharesTable.filter((s) => s.expenseId === result.expenseIds[1]);
    expect(exp2Shares).toHaveLength(2);
    expect(exp2Shares.reduce((sum, s) => sum + s.amount, 0)).toBe(200);

    // Item 3: 600 / 3 = 200 each
    const exp3Shares = sharesTable.filter((s) => s.expenseId === result.expenseIds[2]);
    expect(exp3Shares).toHaveLength(3);
    expect(exp3Shares.reduce((sum, s) => sum + s.amount, 0)).toBe(600);

    // Verify activity logs created with shared batchId
    expect(activityLogsTable).toHaveLength(3);
    for (const log of activityLogsTable) {
      expect((log.after as any)?.batchId).toBe(result.batchId);
    }
  });

  it("all-or-nothing: if row #2 has invalid payer, saves NOTHING and reports failedIndex 1", async () => {
    const { mockDb, expensesTable, sharesTable, activityLogsTable } =
      createMockDb();

    const items = [
      {
        title: "Valid Expense 1",
        amount: 500,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "karim",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
      {
        title: "Invalid Payer Expense",
        amount: 800,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "stranger-999", // Not in trip
        participantIds: ["karim"],
        splitType: "EQUAL",
      },
      {
        title: "Valid Expense 3",
        amount: 300,
        category: "TRANSPORT",
        expenseDate: "2026-10-17",
        paidById: "tanvir",
        participantIds: ["karim", "tanvir"],
        splitType: "EQUAL",
      },
    ];

    let thrownError: unknown = null;
    try {
      await saveBatchExpenses({
        slug: "sylhet-tour-2026",
        currentMemberId: "karim",
        items,
        dbClient: mockDb,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(BatchValidationError);
    const valErr = thrownError as BatchValidationError;
    expect(valErr.failedIndex).toBe(1); // 0-based index of row #2
    expect(valErr.code).toBe("invalid_payer");

    // Atomicity check: NOTHING was saved to the database
    expect(expensesTable).toHaveLength(0);
    expect(sharesTable).toHaveLength(0);
    expect(activityLogsTable).toHaveLength(0);
  });

  it("all-or-nothing: if row #3 has invalid amount (<= 0), saves NOTHING and reports failedIndex 2", async () => {
    const { mockDb, expensesTable, sharesTable, activityLogsTable } =
      createMockDb();

    const items = [
      {
        title: "Valid Expense 1",
        amount: 500,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "karim",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
      {
        title: "Valid Expense 2",
        amount: 800,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "sumi",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
      {
        title: "Invalid Amount Expense",
        amount: 0, // Invalid amount
        category: "TRANSPORT",
        expenseDate: "2026-10-17",
        paidById: "tanvir",
        participantIds: ["karim", "tanvir"],
        splitType: "EQUAL",
      },
    ];

    let thrownError: unknown = null;
    try {
      await saveBatchExpenses({
        slug: "sylhet-tour-2026",
        currentMemberId: "karim",
        items,
        dbClient: mockDb,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(BatchValidationError);
    const valErr = thrownError as BatchValidationError;
    expect(valErr.failedIndex).toBe(2);

    // Atomicity check: NOTHING was saved
    expect(expensesTable).toHaveLength(0);
    expect(sharesTable).toHaveLength(0);
    expect(activityLogsTable).toHaveLength(0);
  });

  it("undoBatchExpenses soft-deletes the whole batch and logs deletion", async () => {
    const { mockDb, expensesTable, activityLogsTable } = createMockDb();

    const items = [
      {
        title: "Expense 1",
        amount: 1000,
        category: "FOOD",
        expenseDate: "2026-10-17",
        paidById: "karim",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
      {
        title: "Expense 2",
        amount: 500,
        category: "TRANSPORT",
        expenseDate: "2026-10-17",
        paidById: "karim",
        participantIds: ["karim", "sumi"],
        splitType: "EQUAL",
      },
    ];

    const saveResult = await saveBatchExpenses({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      items,
      dbClient: mockDb,
    });

    expect(expensesTable).toHaveLength(2);
    expect(expensesTable[0]?.deletedAt).toBeNull();
    expect(expensesTable[1]?.deletedAt).toBeNull();

    // Call Undo
    const undoResult = await undoBatchExpenses({
      slug: "sylhet-tour-2026",
      currentMemberId: "karim",
      batchId: saveResult.batchId,
      dbClient: mockDb,
    });

    expect(undoResult.ok).toBe(true);
    expect(undoResult.undoneCount).toBe(2);

    // Verify soft delete applied to all batch expenses
    expect(expensesTable[0]?.deletedAt).toBeInstanceOf(Date);
    expect(expensesTable[1]?.deletedAt).toBeInstanceOf(Date);

    // Verify deletion activity logs created
    const deleteLogs = activityLogsTable.filter((l) => l.action === "delete");
    expect(deleteLogs).toHaveLength(2);
    for (const dLog of deleteLogs) {
      expect((dLog.after as any)?.batchId).toBe(saveResult.batchId);
      expect((dLog.after as any)?.undone).toBe(true);
    }
  });
});
