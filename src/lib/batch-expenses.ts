import { z } from "zod";
import type { ExpenseCategoryValue, ShareOutput } from "@/lib/money";
import { computeExpenseShares } from "@/lib/money";
import { assertTripWritable, assertValidExpenseSharesForTrip } from "@/lib/safety";
import { EXPENSE_CATEGORIES } from "@/lib/trips";

export interface TripMemberRecord {
  id: string;
  displayName: string;
  emoji?: string | null;
  isGuest?: boolean;
}

export interface TripRecordWithMembers {
  id: string;
  slug: string;
  name?: string;
  lockedAt: Date | null;
  creatorMemberId?: string | null;
  members: TripMemberRecord[];
}

export type BatchExpensesDbClient = {
  trip: {
    findUnique: (args: {
      where: { slug?: string; id?: string };
      include?: { members?: boolean | { orderBy?: { createdAt: "asc" } } };
      select?: { id?: boolean };
    }) => Promise<TripRecordWithMembers | null>;
  };
  activityLog: {
    findMany: (args: {
      where: { tripId: string; action: string };
    }) => Promise<
      Array<{
        id: string;
        tripId: string;
        memberId: string;
        entityType: string;
        entityId: string;
        action: string;
        before?: unknown;
        after?: unknown;
      }>
    >;
  };
  $transaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
};

async function resolveDb(
  overrideDb?: BatchExpensesDbClient,
): Promise<BatchExpensesDbClient> {
  if (overrideDb) return overrideDb;
  const { db } = await import("@/lib/db");
  return db as unknown as BatchExpensesDbClient;
}

export const batchExpenseItemSchema = z.object({
  title: z.string().trim().min(1, "title_required").max(100, "title_long"),
  amount: z
    .number()
    .int("amount_must_be_integer")
    .positive("amount_must_be_positive")
    .max(10_000_000, "amount_too_large"),
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  expenseDate: z
    .string()
    .trim()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "invalid_date",
    }),
  paidById: z.string().min(1, "paid_by_required"),
  participantIds: z.array(z.string().min(1)).min(1, "participants_required"),
  splitType: z.literal("EQUAL").default("EQUAL"),
  rawInput: z.string().trim().max(500).optional().nullable(),
  routeFrom: z.string().trim().max(80).optional().nullable(),
  routeTo: z.string().trim().max(80).optional().nullable(),
  placeName: z.string().trim().max(80).optional().nullable(),
  isSettlement: z.boolean().optional().default(false),
  receiverId: z.string().trim().optional().nullable(),
});

export type BatchExpenseItem = z.infer<typeof batchExpenseItemSchema>;

export const batchExpenseRequestSchema = z.object({
  expenses: z
    .array(batchExpenseItemSchema)
    .min(1, "empty_batch")
    .max(25, "batch_too_large"),
});

export class BatchValidationError extends Error {
  readonly failedIndex: number;
  readonly code: string;

  constructor(failedIndex: number, code: string, message: string) {
    super(message);
    this.name = "BatchValidationError";
    this.failedIndex = failedIndex;
    this.code = code;
  }
}

export function parseDhakaDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00+06:00`);
}

export interface PreparedBatchItem {
  isSettlement: boolean;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDate: Date;
  paidById: string;
  shares: ShareOutput[];
  rawInput?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  placeName?: string | null;
  receiverId?: string | null;
}

/**
 * Validates and saves an entire batch of expenses in ONE database transaction.
 * All-or-nothing guarantee: if any row fails validation or database execution, nothing is saved.
 */
export async function saveBatchExpenses(args: {
  slug: string;
  currentMemberId: string;
  items: unknown[];
  dbClient?: BatchExpensesDbClient;
}): Promise<{
  ok: true;
  batchId: string;
  count: number;
  expenseIds: string[];
  settlementIds: string[];
}> {
  const db = await resolveDb(args.dbClient);

  const trip = await db.trip.findUnique({
    where: { slug: args.slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!trip) {
    throw new Error("trip_not_found");
  }

  assertTripWritable(trip);

  const currentMember = trip.members.find(
    (m: TripMemberRecord) => m.id === args.currentMemberId,
  );
  if (!currentMember) {
    throw new Error("unauthorized");
  }

  const validMemberIds = new Set<string>(
    trip.members.map((m: TripMemberRecord) => m.id),
  );

  const parsedRequest = batchExpenseRequestSchema.safeParse({
    expenses: args.items,
  });

  if (!parsedRequest.success) {
    const firstIssue = parsedRequest.error.issues[0];
    const pathIdx =
      typeof firstIssue?.path[1] === "number" ? firstIssue.path[1] : 0;
    throw new BatchValidationError(
      pathIdx,
      firstIssue?.message ?? "invalid_input",
      firstIssue?.message ?? "Invalid batch input",
    );
  }

  const preparedItems: PreparedBatchItem[] = [];

  // Server-side revalidation of every row
  for (let i = 0; i < parsedRequest.data.expenses.length; i++) {
    const item = parsedRequest.data.expenses[i]!;

    if (!validMemberIds.has(item.paidById)) {
      throw new BatchValidationError(
        i,
        "invalid_payer",
        `Payer in row #${i + 1} is not a member of this trip.`,
      );
    }

    if (item.isSettlement && item.receiverId) {
      if (!validMemberIds.has(item.receiverId)) {
        throw new BatchValidationError(
          i,
          "invalid_receiver",
          `Recipient in row #${i + 1} is not a member of this trip.`,
        );
      }
      if (item.paidById === item.receiverId) {
        throw new BatchValidationError(
          i,
          "same_member_settlement",
          `Payer and recipient cannot be the same in row #${i + 1}.`,
        );
      }

      preparedItems.push({
        isSettlement: true,
        title: item.title,
        amount: item.amount,
        category: "OTHER",
        expenseDate: parseDhakaDate(item.expenseDate),
        paidById: item.paidById,
        shares: [],
        rawInput: item.rawInput,
        receiverId: item.receiverId,
      });
      continue;
    }

    const selectedParticipantIds = item.participantIds.filter((id) =>
      validMemberIds.has(id),
    );

    if (selectedParticipantIds.length === 0) {
      throw new BatchValidationError(
        i,
        "participants_required",
        `Row #${i + 1} must include at least one valid participant.`,
      );
    }

    let shares: ShareOutput[];
    try {
      shares = computeExpenseShares({
        amount: item.amount,
        paidById: item.paidById,
        splitType: "EQUAL",
        participantIds: selectedParticipantIds,
      });

      assertValidExpenseSharesForTrip({
        expenseAmount: item.amount,
        paidById: item.paidById,
        shares,
        validTripMemberIds: validMemberIds,
      });
    } catch (err) {
      throw new BatchValidationError(
        i,
        "invalid_shares",
        `Share calculation failed on row #${i + 1}: ${err instanceof Error ? err.message : "invalid_shares"}`,
      );
    }

    preparedItems.push({
      isSettlement: false,
      title: item.title,
      amount: item.amount,
      category: item.category,
      expenseDate: parseDhakaDate(item.expenseDate),
      paidById: item.paidById,
      shares,
      rawInput: item.rawInput,
      routeFrom: item.routeFrom,
      routeTo: item.routeTo,
      placeName: item.placeName,
    });
  }

  const batchId = crypto.randomUUID();
  const createdExpenseIds: string[] = [];
  const createdSettlementIds: string[] = [];

  // ONE atomic database transaction
  await db.$transaction(async (tx) => {
    for (const prep of preparedItems) {
      if (prep.isSettlement && prep.receiverId) {
        const settlement = await tx.settlement.create({
          data: {
            tripId: trip.id,
            fromMemberId: prep.paidById,
            toMemberId: prep.receiverId,
            amount: prep.amount,
            createdById: currentMember.id,
          },
        });
        createdSettlementIds.push(settlement.id);

        await tx.activityLog.create({
          data: {
            tripId: trip.id,
            memberId: currentMember.id,
            entityType: "settlement",
            entityId: settlement.id,
            action: "create",
            after: {
              fromMemberId: settlement.fromMemberId,
              toMemberId: settlement.toMemberId,
              amount: settlement.amount,
              batchId,
            },
          },
        });
      } else {
        const created = await tx.expense.create({
          data: {
            tripId: trip.id,
            title: prep.title,
            amount: prep.amount,
            category: prep.category,
            expenseDate: prep.expenseDate,
            paidById: prep.paidById,
            createdById: currentMember.id,
            splitType: "EQUAL",
            note: null,
            rawInput: prep.rawInput ?? null,
            routeFrom: prep.routeFrom ?? null,
            routeTo: prep.routeTo ?? null,
            placeName: prep.placeName ?? null,
            shares: {
              create: prep.shares.map((s) => ({
                memberId: s.memberId,
                amount: s.amount,
              })),
            },
          },
        });
        createdExpenseIds.push(created.id);

        await tx.activityLog.create({
          data: {
            tripId: trip.id,
            memberId: currentMember.id,
            entityType: "expense",
            entityId: created.id,
            action: "create",
            after: {
              title: created.title,
              amount: created.amount,
              category: created.category,
              paidById: created.paidById,
              splitType: created.splitType,
              shares: prep.shares,
              batchId,
            },
          },
        });
      }
    }
  });

  return {
    ok: true,
    batchId,
    count: createdExpenseIds.length + createdSettlementIds.length,
    expenseIds: createdExpenseIds,
    settlementIds: createdSettlementIds,
  };
}

/**
 * Undoes an entire batch of expenses and settlements by batchId within a single transaction.
 * Soft-deletes all entities in the batch and creates deletion activity logs.
 */
export async function undoBatchExpenses(args: {
  slug: string;
  currentMemberId: string;
  batchId: string;
  dbClient?: BatchExpensesDbClient;
}): Promise<{
  ok: true;
  undoneCount: number;
  batchId: string;
}> {
  const db = await resolveDb(args.dbClient);

  const trip = await db.trip.findUnique({
    where: { slug: args.slug },
    include: { members: true },
  });

  if (!trip) {
    throw new Error("trip_not_found");
  }

  assertTripWritable(trip);

  const currentMember = trip.members.find(
    (m: TripMemberRecord) => m.id === args.currentMemberId,
  );
  if (!currentMember) {
    throw new Error("unauthorized");
  }

  // Find all activity logs for this trip
  const logs = await db.activityLog.findMany({
    where: {
      tripId: trip.id,
      action: "create",
    },
  });

  // Filter logs by batchId
  const batchLogs = logs.filter((log) => {
    const afterObj = log.after as Record<string, unknown> | null;
    return afterObj?.batchId === args.batchId;
  });

  if (batchLogs.length === 0) {
    return { ok: true, undoneCount: 0, batchId: args.batchId };
  }

  // Security check: Only the person who created the batch or the trip creator can undo it
  const isCreator = currentMember.id === trip.creatorMemberId;
  const isBatchAuthor = batchLogs.every((l) => l.memberId === currentMember.id);

  if (!isCreator && !isBatchAuthor) {
    throw new Error("unauthorized");
  }

  const expenseIds = batchLogs
    .filter((l) => l.entityType === "expense")
    .map((l) => l.entityId);

  const settlementIds = batchLogs
    .filter((l) => l.entityType === "settlement")
    .map((l) => l.entityId);

  const deletedAt = new Date();

  await db.$transaction(async (tx) => {
    if (expenseIds.length > 0) {
      await tx.expense.updateMany({
        where: { id: { in: expenseIds }, deletedAt: null },
        data: { deletedAt },
      });
    }

    if (settlementIds.length > 0) {
      await tx.settlement.updateMany({
        where: { id: { in: settlementIds }, deletedAt: null },
        data: { deletedAt },
      });
    }

    for (const log of batchLogs) {
      await tx.activityLog.create({
        data: {
          tripId: trip.id,
          memberId: currentMember.id,
          entityType: log.entityType,
          entityId: log.entityId,
          action: "delete",
          before: log.after as Record<string, unknown>,
          after: {
            deletedAt: deletedAt.toISOString(),
            batchId: args.batchId,
            undone: true,
          },
        },
      });
    }
  });

  return {
    ok: true,
    undoneCount: expenseIds.length + settlementIds.length,
    batchId: args.batchId,
  };
}
