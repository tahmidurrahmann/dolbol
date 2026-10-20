import { z } from "zod";
import type { ExpenseCategoryValue, ShareOutput, SplitTypeValue } from "@/lib/money";
import { computeExpenseShares } from "@/lib/money";
import { assertTripWritable, assertValidExpenseSharesForTrip } from "@/lib/safety";
import { EXPENSE_CATEGORIES, SPLIT_TYPES } from "@/lib/trips";

export class ExpenseValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ExpenseValidationError";
    this.code = code;
  }
}

export class ExpenseConflictError extends Error {
  readonly code = "id_conflict";
  constructor(message: string) {
    super(message);
    this.name = "ExpenseConflictError";
  }
}

export class TripLockedError extends Error {
  readonly code = "trip_locked";
  constructor(message: string) {
    super(message);
    this.name = "TripLockedError";
  }
}

export class UnauthorizedError extends Error {
  readonly code = "unauthorized";
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class TripNotFoundError extends Error {
  readonly code = "trip_not_found";
  constructor(message: string) {
    super(message);
    this.name = "TripNotFoundError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createExpensePayloadSchema = z.object({
  id: z.string().trim().optional(),
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
  splitType: z.enum(SPLIT_TYPES).default("EQUAL"),
  participantIds: z.array(z.string().min(1)).optional(),
  exactShares: z
    .array(
      z.object({
        memberId: z.string().min(1),
        amount: z.number().int().positive(),
      }),
    )
    .optional(),
  percentShares: z
    .array(
      z.object({
        memberId: z.string().min(1),
        percent: z.number().positive(),
      }),
    )
    .optional(),
  note: z.string().trim().max(200).optional().nullable(),
  rawInput: z.string().trim().max(500).optional().nullable(),
  routeFrom: z.string().trim().max(80).optional().nullable(),
  routeTo: z.string().trim().max(80).optional().nullable(),
  placeName: z.string().trim().max(80).optional().nullable(),
});

export type CreateExpensePayload = z.infer<typeof createExpensePayloadSchema>;

export interface SingleExpenseDbClient {
  trip: {
    findUnique: (args: {
      where: { slug?: string; id?: string };
      include?: { members?: boolean | { orderBy?: { createdAt: "asc" } } };
      select?: { id?: boolean };
    }) => Promise<{
      id: string;
      slug: string;
      lockedAt: Date | null;
      creatorMemberId?: string | null;
      members: Array<{
        id: string;
        displayName: string;
        emoji?: string | null;
        isGuest?: boolean;
      }>;
    } | null>;
  };
  expense: {
    findUnique: (args: {
      where: { id: string };
      include?: { shares?: boolean };
    }) => Promise<{
      id: string;
      tripId: string;
      title: string;
      amount: number;
      category: string;
      expenseDate: Date;
      paidById: string;
      createdById: string;
      splitType: string;
      shares?: Array<{ memberId: string; amount: number }>;
    } | null>;
  };
  $transaction: <T>(callback: (tx: SingleExpenseTx) => Promise<T>) => Promise<T>;
}

export interface SingleExpenseTx {
  expense: {
    create: (args: {
      data: {
        id?: string;
        tripId: string;
        title: string;
        amount: number;
        category: ExpenseCategoryValue;
        expenseDate: Date;
        paidById: string;
        createdById: string;
        splitType: SplitTypeValue;
        note?: string | null;
        rawInput?: string | null;
        routeFrom?: string | null;
        routeTo?: string | null;
        placeName?: string | null;
        shares: {
          create: Array<{ memberId: string; amount: number }>;
        };
      };
      include?: { shares?: boolean };
    }) => Promise<{
      id: string;
      tripId: string;
      title: string;
      amount: number;
      category: string;
      expenseDate: Date;
      paidById: string;
      createdById: string;
      splitType: string;
      shares?: Array<{ memberId: string; amount: number }>;
    }>;
  };
  activityLog: {
    create: (args: {
      data: {
        tripId: string;
        memberId: string | null;
        entityType: string;
        entityId: string;
        action: string;
        after: unknown;
      };
    }) => Promise<unknown>;
  };
}

function parseDhakaDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00+06:00`);
}

/**
 * Creates a single expense with full server revalidation, idempotency, and activity logging.
 */
export async function createSingleExpense(args: {
  slug: string;
  currentMemberId: string;
  payload: unknown;
  dbClient?: SingleExpenseDbClient;
}): Promise<{
  ok: true;
  idempotent?: boolean;
  expense: {
    id: string;
    tripId: string;
    title: string;
    amount: number;
    category: string;
    expenseDate: Date;
    paidById: string;
    splitType: string;
    shares: Array<{ memberId: string; amount: number }>;
  };
}> {
  let db: SingleExpenseDbClient;
  if (args.dbClient) {
    db = args.dbClient;
  } else {
    const { db: realDb } = await import("@/lib/db");
    db = realDb as unknown as SingleExpenseDbClient;
  }

  // 1. Validate payload structure
  const parseResult = createExpensePayloadSchema.safeParse(args.payload);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    throw new ExpenseValidationError(
      firstIssue?.message ?? "invalid_input",
      firstIssue?.message ?? "Invalid expense payload",
    );
  }

  const data = parseResult.data;

  // 2. Validate client-supplied UUID format (if supplied)
  if (data.id && !UUID_REGEX.test(data.id)) {
    throw new ExpenseValidationError("invalid_id", "Malformed expense UUID.");
  }

  // 3. Resolve Trip
  const trip = await db.trip.findUnique({
    where: { slug: args.slug },
    include: { members: true },
  });

  if (!trip) {
    throw new TripNotFoundError("Trip not found");
  }

  // 4. Idempotency Check (if client supplied an ID)
  if (data.id) {
    const existing = await db.expense.findUnique({
      where: { id: data.id },
      include: { shares: true },
    });

    if (existing) {
      if (existing.tripId === trip.id) {
        // Idempotent hit: return existing expense cleanly
        return {
          ok: true,
          idempotent: true,
          expense: {
            id: existing.id,
            tripId: existing.tripId,
            title: existing.title,
            amount: existing.amount,
            category: existing.category,
            expenseDate: existing.expenseDate,
            paidById: existing.paidById,
            splitType: existing.splitType,
            shares: existing.shares || [],
          },
        };
      } else {
        // Same ID exists in a different trip: 409 conflict
        throw new ExpenseConflictError(
          "Expense with this ID already exists in another trip.",
        );
      }
    }
  }

  // 5. Trip lock check
  try {
    assertTripWritable(trip);
  } catch {
    throw new TripLockedError("Trip is locked.");
  }

  // 6. Member authorization
  const currentMember = trip.members.find((m) => m.id === args.currentMemberId);
  if (!currentMember) {
    throw new UnauthorizedError("Current member is not authorized on this trip.");
  }

  const validMemberIds = new Set<string>(trip.members.map((m) => m.id));

  // 7. Revalidate payer
  if (!validMemberIds.has(data.paidById)) {
    throw new ExpenseValidationError(
      "invalid_payer",
      "Payer does not belong to this trip.",
    );
  }

  // 8. Server-side Share Computation (Never trust client share amounts)
  let computedShares: ShareOutput[];
  try {
    if (data.splitType === "EQUAL") {
      const participants = (data.participantIds ?? []).filter((id) =>
        validMemberIds.has(id),
      );
      if (participants.length === 0) {
        throw new ExpenseValidationError(
          "participants_required",
          "At least one valid participant is required for EQUAL split.",
        );
      }

      computedShares = computeExpenseShares({
        amount: data.amount,
        paidById: data.paidById,
        splitType: "EQUAL",
        participantIds: participants,
      });
    } else if (data.splitType === "EXACT") {
      const exactShares = (data.exactShares ?? []).filter((s) =>
        validMemberIds.has(s.memberId),
      );
      computedShares = computeExpenseShares({
        amount: data.amount,
        paidById: data.paidById,
        splitType: "EXACT",
        exactShares,
      });
    } else {
      const percentShares = (data.percentShares ?? []).filter((s) =>
        validMemberIds.has(s.memberId),
      );
      computedShares = computeExpenseShares({
        amount: data.amount,
        paidById: data.paidById,
        splitType: "PERCENT",
        percentShares,
      });
    }

    assertValidExpenseSharesForTrip({
      expenseAmount: data.amount,
      paidById: data.paidById,
      shares: computedShares,
      validTripMemberIds: validMemberIds,
    });
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      throw err;
    }
    throw new ExpenseValidationError(
      "invalid_shares",
      err instanceof Error ? err.message : "Invalid shares configuration",
    );
  }

  const expenseDate = parseDhakaDate(data.expenseDate);

  // 9. Atomic Transaction
  const created = await db.$transaction(async (tx: SingleExpenseTx) => {
    const expenseData: Parameters<typeof tx.expense.create>[0]["data"] = {
      tripId: trip.id,
      title: data.title,
      amount: data.amount,
      category: data.category as ExpenseCategoryValue,
      expenseDate,
      paidById: data.paidById,
      createdById: currentMember.id,
      splitType: data.splitType as SplitTypeValue,
      note: data.note ?? null,
      rawInput: data.rawInput ?? null,
      routeFrom: data.routeFrom ?? null,
      routeTo: data.routeTo ?? null,
      placeName: data.placeName ?? null,
      shares: {
        create: computedShares.map((s) => ({
          memberId: s.memberId,
          amount: s.amount,
        })),
      },
    };

    if (data.id) {
      expenseData.id = data.id;
    }

    const newExpense = await tx.expense.create({
      data: expenseData,
      include: { shares: true },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "expense",
        entityId: newExpense.id,
        action: "create",
        after: {
          title: newExpense.title,
          amount: newExpense.amount,
          category: newExpense.category,
          paidById: newExpense.paidById,
          splitType: newExpense.splitType,
          shares: computedShares,
        },
      },
    });

    return newExpense;
  });

  return {
    ok: true,
    expense: {
      id: created.id,
      tripId: created.tripId,
      title: created.title,
      amount: created.amount,
      category: created.category,
      expenseDate: created.expenseDate,
      paidById: created.paidById,
      splitType: created.splitType,
      shares: computedShares,
    },
  };
}
