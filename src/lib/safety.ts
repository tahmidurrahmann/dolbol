import type {
  ExpenseCategoryValue,
  ExpenseRecordInput,
  SettlementRecordInput,
  ShareOutput,
  SplitTypeValue,
} from "@/lib/money";
import { dayKey } from "@/lib/time";

export class SafetyViolationError extends Error {
  public readonly code:
    | "trip_locked"
    | "invalid_shares"
    | "cross_trip_member"
    | "cross_trip_option"
    | "guest_cannot_vote"
    | "duplicate_expense_warning";

  constructor(
    code:
      | "trip_locked"
      | "invalid_shares"
      | "cross_trip_member"
      | "cross_trip_option"
      | "guest_cannot_vote"
      | "duplicate_expense_warning",
    message: string,
  ) {
    super(message);
    this.name = "SafetyViolationError";
    this.code = code;
  }
}

/**
 * Guard 1: Locked trips block every write route.
 */
export function assertTripWritable(trip: { lockedAt: Date | null }): void {
  if (trip.lockedAt !== null) {
    throw new SafetyViolationError(
      "trip_locked",
      "Trip is locked and blocks all write operations.",
    );
  }
}

/**
 * Guard 2: Verify share amounts are integer whole taka, belong to members of the same trip,
 * have no duplicate memberIds, and add up to the exact expense amount before saving.
 */
export function assertValidExpenseSharesForTrip(args: {
  expenseAmount: number;
  paidById: string;
  shares: ReadonlyArray<ShareOutput>;
  validTripMemberIds: ReadonlySet<string>;
}): void {
  const { expenseAmount, paidById, shares, validTripMemberIds } = args;

  if (!Number.isInteger(expenseAmount) || expenseAmount <= 0) {
    throw new SafetyViolationError(
      "invalid_shares",
      "Expense amount must be a positive integer in whole taka.",
    );
  }

  if (!validTripMemberIds.has(paidById)) {
    throw new SafetyViolationError(
      "cross_trip_member",
      `Payer ${paidById} does not belong to this trip.`,
    );
  }

  if (shares.length === 0) {
    throw new SafetyViolationError(
      "invalid_shares",
      "At least one expense share is required.",
    );
  }

  const seenMembers = new Set<string>();
  let sum = 0;

  for (const share of shares) {
    if (!validTripMemberIds.has(share.memberId)) {
      throw new SafetyViolationError(
        "cross_trip_member",
        `Share member ${share.memberId} does not belong to this trip.`,
      );
    }
    if (seenMembers.has(share.memberId)) {
      throw new SafetyViolationError(
        "invalid_shares",
        `Duplicate share entry for member ${share.memberId}.`,
      );
    }
    if (!Number.isInteger(share.amount) || share.amount < 0) {
      throw new SafetyViolationError(
        "invalid_shares",
        `Share amount for ${share.memberId} must be a non-negative integer.`,
      );
    }
    seenMembers.add(share.memberId);
    sum += share.amount;
  }

  if (sum !== expenseAmount) {
    throw new SafetyViolationError(
      "invalid_shares",
      `Share amounts sum (${sum}) does not equal expense amount (${expenseAmount}).`,
    );
  }
}

/**
 * Guard 3: Verify a destination Vote option and voter both belong to the exact same trip,
 * and that the voter is not a guest.
 */
export function assertVoteOptionBelongsToTrip(args: {
  tripId: string;
  member: { id: string; tripId: string; isGuest?: boolean };
  option: { id: string; tripId: string } | null | undefined;
}): void {
  if (!args.option || args.option.tripId !== args.tripId) {
    throw new SafetyViolationError(
      "cross_trip_option",
      "Vote option does not belong to this trip.",
    );
  }

  if (args.member.tripId !== args.tripId) {
    throw new SafetyViolationError(
      "cross_trip_member",
      "Voting member does not belong to this trip.",
    );
  }

  if (args.member.isGuest) {
    throw new SafetyViolationError(
      "guest_cannot_vote",
      "Guest members cannot cast votes.",
    );
  }
}

export interface DuplicateCandidateCheckInput {
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDate: Date;
  paidById: string;
  excludeExpenseId?: string;
}

function normalizeExpenseTitle(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Guard 4: Duplicate-entry warning detector.
 * Flags a potential duplicate when an active (non-deleted) expense on the same Asia/Dhaka
 * calendar day has the exact same whole-taka amount AND either:
 *   (a) the same normalized title, OR
 *   (b) the same payer and category.
 */
export function findDuplicateExpenseCandidate(
  candidate: DuplicateCandidateCheckInput,
  existingExpenses: ReadonlyArray<
    Pick<
      ExpenseRecordInput,
      | "id"
      | "title"
      | "amount"
      | "category"
      | "expenseDate"
      | "paidById"
      | "deletedAt"
    >
  >,
): Pick<
  ExpenseRecordInput,
  "id" | "title" | "amount" | "category" | "expenseDate" | "paidById"
> | null {
  const candidateDay = dayKey(candidate.expenseDate);
  const candidateTitleNorm = normalizeExpenseTitle(candidate.title);

  for (const existing of existingExpenses) {
    if (existing.deletedAt) {
      continue;
    }
    if (
      candidate.excludeExpenseId &&
      existing.id === candidate.excludeExpenseId
    ) {
      continue;
    }
    if (existing.amount !== candidate.amount) {
      continue;
    }
    if (dayKey(existing.expenseDate) !== candidateDay) {
      continue;
    }

    const existingTitleNorm = normalizeExpenseTitle(existing.title);
    const sameTitle =
      candidateTitleNorm.length > 0 && existingTitleNorm === candidateTitleNorm;
    const samePayerAndCategory =
      existing.paidById === candidate.paidById &&
      existing.category === candidate.category;

    if (sameTitle || samePayerAndCategory) {
      return existing;
    }
  }

  return null;
}

export interface ActivityLogSnapshot {
  title?: string;
  amount?: number;
  category?: ExpenseCategoryValue;
  paidById?: string;
  splitType?: SplitTypeValue;
  fromMemberId?: string;
  toMemberId?: string;
  displayName?: string;
  emoji?: string | null;
  name?: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lockedAt?: string | null;
  deletedAt?: string | null;
  shares?: ShareOutput[];
}

export interface ActivityLogRecordInput {
  id: string;
  tripId: string;
  memberId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: ActivityLogSnapshot | null;
  after: ActivityLogSnapshot | null;
  createdAt: Date;
}

export interface ExpenseEditHistoryEntry {
  logId: string;
  expenseId: string;
  editorMemberId: string | null;
  editedAt: Date;
  editedAfterSettlement: boolean;
  beforeTitle?: string;
  afterTitle?: string;
  beforeAmount?: number;
  afterAmount?: number;
  beforePaidById?: string;
  afterPaidById?: string;
  beforeCategory?: ExpenseCategoryValue;
  afterCategory?: ExpenseCategoryValue;
  beforeSplitType?: SplitTypeValue;
  afterSplitType?: SplitTypeValue;
}

/**
 * Extracts chronological edit history for a specific expense from ActivityLog rows,
 * flagging each edit that occurred after any active settlement on the trip.
 */
export function extractExpenseEditHistory(args: {
  expenseId: string;
  activityLogs: ReadonlyArray<ActivityLogRecordInput>;
  settlements: ReadonlyArray<
    Pick<SettlementRecordInput, "createdAt" | "deletedAt">
  >;
}): ExpenseEditHistoryEntry[] {
  const activeSettlementTimes = args.settlements
    .filter((s) => !s.deletedAt)
    .map((s) => s.createdAt.getTime());

  const earliestSettlementMs =
    activeSettlementTimes.length > 0
      ? Math.min(...activeSettlementTimes)
      : null;

  return args.activityLogs
    .filter(
      (log) =>
        log.entityType === "expense" &&
        log.entityId === args.expenseId &&
        log.action === "update",
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((log) => {
      const editedAfterSettlement =
        earliestSettlementMs !== null &&
        log.createdAt.getTime() > earliestSettlementMs;

      return {
        logId: log.id,
        expenseId: args.expenseId,
        editorMemberId: log.memberId,
        editedAt: log.createdAt,
        editedAfterSettlement,
        beforeTitle: log.before?.title,
        afterTitle: log.after?.title,
        beforeAmount: log.before?.amount,
        afterAmount: log.after?.amount,
        beforePaidById: log.before?.paidById,
        afterPaidById: log.after?.paidById,
        beforeCategory: log.before?.category,
        afterCategory: log.after?.category,
        beforeSplitType: log.before?.splitType,
        afterSplitType: log.after?.splitType,
      };
    });
}
