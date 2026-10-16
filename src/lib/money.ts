import { formatDate, type SupportedLocale, toBanglaDigits } from "@/lib/format";
import { dayKey } from "@/lib/time";

export type SplitTypeValue = "EQUAL" | "EXACT" | "PERCENT";
export type ExpenseCategoryValue =
  "TRANSPORT" | "HOTEL" | "FOOD" | "TICKET" | "OTHER";

export type ShareOutput = {
  memberId: string;
  amount: number;
};

export interface ExactShareInput {
  memberId: string;
  amount: number;
}

export interface PercentShareInput {
  memberId: string;
  percent: number;
}

export interface ComputeSharesInput {
  amount: number;
  paidById: string;
  splitType: SplitTypeValue;
  participantIds?: string[];
  exactShares?: ExactShareInput[];
  percentShares?: PercentShareInput[];
}

function assertPositiveIntegerTaka(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer in whole taka.`);
  }
}

/**
 * Computes integer whole-taka shares for an expense.
 * Any integer rounding leftover is assigned to paidById (if paidById is a participant in the split),
 * or to the first participant in deterministic order when paidById is not part of the split.
 * Guarantees sum(shares) === amount and every share is an integer >= 0.
 */
export function computeExpenseShares(input: ComputeSharesInput): ShareOutput[] {
  const { amount, paidById, splitType } = input;
  assertPositiveIntegerTaka(amount, "Expense amount");

  if (!paidById || paidById.trim().length === 0) {
    throw new RangeError("paidById is required.");
  }

  if (splitType === "EQUAL") {
    const rawIds = input.participantIds ?? [];
    const uniqueIds = Array.from(
      new Set(rawIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    );
    if (uniqueIds.length === 0) {
      throw new RangeError(
        "At least one participant is required for EQUAL split.",
      );
    }

    const count = uniqueIds.length;
    const baseShare = Math.floor(amount / count);
    const remainder = amount - baseShare * count;

    const leftoverRecipientId = uniqueIds.includes(paidById)
      ? paidById
      : uniqueIds[0]!;

    const shares = uniqueIds.map((memberId) => ({
      memberId,
      amount:
        memberId === leftoverRecipientId ? baseShare + remainder : baseShare,
    }));

    verifySharesSum(shares, amount);
    return shares;
  }

  if (splitType === "EXACT") {
    const rawExact = input.exactShares ?? [];
    const activeExact = rawExact.filter((item) => item.amount > 0);
    if (activeExact.length === 0) {
      throw new RangeError("EXACT split requires at least one positive share.");
    }

    const seen = new Set<string>();
    let total = 0;
    const shares: ShareOutput[] = [];

    for (const entry of activeExact) {
      assertPositiveIntegerTaka(
        entry.amount,
        `Exact share for ${entry.memberId}`,
      );
      if (seen.has(entry.memberId)) {
        throw new RangeError(
          `Duplicate memberId in EXACT split: ${entry.memberId}`,
        );
      }
      seen.add(entry.memberId);
      total += entry.amount;
      shares.push({ memberId: entry.memberId, amount: entry.amount });
    }

    if (total !== amount) {
      throw new RangeError(
        `EXACT shares sum (${total}) does not equal expense amount (${amount}).`,
      );
    }

    verifySharesSum(shares, amount);
    return shares;
  }

  if (splitType === "PERCENT") {
    const rawPercent = input.percentShares ?? [];
    const activePercent = rawPercent.filter((item) => item.percent > 0);
    if (activePercent.length === 0) {
      throw new RangeError(
        "PERCENT split requires at least one positive percentage.",
      );
    }

    const seen = new Set<string>();
    let percentSum = 0;

    for (const entry of activePercent) {
      if (!Number.isFinite(entry.percent) || entry.percent <= 0) {
        throw new RangeError(`Invalid percentage for ${entry.memberId}`);
      }
      if (seen.has(entry.memberId)) {
        throw new RangeError(
          `Duplicate memberId in PERCENT split: ${entry.memberId}`,
        );
      }
      seen.add(entry.memberId);
      percentSum += entry.percent;
    }

    // Allow tiny floating-point tolerance around 100% (e.g. 99.99..100.01) only if close to 100
    if (Math.round(percentSum * 100) !== 10000) {
      throw new RangeError(
        `PERCENT split values must add up to 100 (got ${percentSum}).`,
      );
    }

    const flooredShares = activePercent.map((entry) => ({
      memberId: entry.memberId,
      amount: Math.floor((amount * entry.percent) / 100),
    }));

    const flooredTotal = flooredShares.reduce((sum, s) => sum + s.amount, 0);
    const remainder = amount - flooredTotal;

    const hasPayer = flooredShares.some((s) => s.memberId === paidById);
    const leftoverRecipientId = hasPayer
      ? paidById
      : flooredShares[0]!.memberId;

    const shares = flooredShares.map((s) => ({
      memberId: s.memberId,
      amount:
        s.memberId === leftoverRecipientId ? s.amount + remainder : s.amount,
    }));

    verifySharesSum(shares, amount);
    return shares;
  }

  throw new RangeError(`Unsupported splitType: ${String(splitType)}`);
}

export function verifySharesSum(
  shares: ShareOutput[],
  expectedTotal: number,
): void {
  let sum = 0;
  for (const s of shares) {
    if (!Number.isInteger(s.amount) || s.amount < 0) {
      throw new RangeError(
        `Invalid share amount for ${s.memberId}: ${s.amount}`,
      );
    }
    sum += s.amount;
  }
  if (sum !== expectedTotal) {
    throw new RangeError(
      `Share amounts sum (${sum}) does not match expense amount (${expectedTotal}).`,
    );
  }
}

export interface MemberInput {
  id: string;
  displayName: string;
  emoji?: string | null;
  isGuest?: boolean;
}

export interface ExpenseRecordInput {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDate: Date;
  paidById: string;
  createdById: string;
  splitType: SplitTypeValue;
  note?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shares: ShareOutput[];
}

export interface SettlementRecordInput {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  createdById: string;
  deletedAt?: Date | null;
  createdAt: Date;
}

export interface MemberBalance {
  memberId: string;
  displayName: string;
  emoji: string;
  isGuest: boolean;
  totalPaid: number;
  totalOwed: number;
  settlementsSent: number;
  settlementsReceived: number;
  /**
   * Positive = this member is owed money overall (creditor).
   * Negative = this member owes money overall (debtor).
   * Zero = settled up.
   */
  netBalance: number;
}

export interface SimplifiedDebtTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * Computes per-member totals and net balances on read from active (non-deleted)
 * expenses and settlements.
 */
export function computeMemberBalances(args: {
  members: MemberInput[];
  expenses: ExpenseRecordInput[];
  settlements: SettlementRecordInput[];
}): MemberBalance[] {
  const map = new Map<string, MemberBalance>();

  for (const m of args.members) {
    map.set(m.id, {
      memberId: m.id,
      displayName: m.displayName,
      emoji: m.emoji ?? (m.isGuest ? "👤" : "🎒"),
      isGuest: Boolean(m.isGuest),
      totalPaid: 0,
      totalOwed: 0,
      settlementsSent: 0,
      settlementsReceived: 0,
      netBalance: 0,
    });
  }

  for (const exp of args.expenses) {
    if (exp.deletedAt) {
      continue;
    }
    verifySharesSum(exp.shares, exp.amount);

    const payer = map.get(exp.paidById);
    if (!payer) {
      throw new RangeError(
        `Expense ${exp.id} references unknown payer ${exp.paidById}`,
      );
    }
    payer.totalPaid += exp.amount;

    for (const share of exp.shares) {
      const participant = map.get(share.memberId);
      if (!participant) {
        throw new RangeError(
          `Expense ${exp.id} share references unknown member ${share.memberId}`,
        );
      }
      participant.totalOwed += share.amount;
    }
  }

  for (const settlement of args.settlements) {
    if (settlement.deletedAt) {
      continue;
    }
    assertPositiveIntegerTaka(settlement.amount, `Settlement ${settlement.id}`);

    const sender = map.get(settlement.fromMemberId);
    const receiver = map.get(settlement.toMemberId);
    if (!sender || !receiver) {
      throw new RangeError(
        `Settlement ${settlement.id} references unknown member(s).`,
      );
    }
    sender.settlementsSent += settlement.amount;
    receiver.settlementsReceived += settlement.amount;
  }

  const result: MemberBalance[] = [];
  for (const bal of map.values()) {
    bal.netBalance =
      bal.totalPaid -
      bal.totalOwed +
      (bal.settlementsSent - bal.settlementsReceived);
    result.push(bal);
  }

  return result;
}

/**
 * Simplifies net balances into the minimal set of direct whole-taka transfers
 * from debtors (netBalance < 0) to creditors (netBalance > 0).
 */
export function simplifyDebts(
  balances: readonly MemberBalance[],
): SimplifiedDebtTransfer[] {
  const debtors = balances
    .filter((b) => b.netBalance < 0)
    .map((b) => ({ memberId: b.memberId, remaining: -b.netBalance }))
    .sort(
      (a, b) =>
        b.remaining - a.remaining || a.memberId.localeCompare(b.memberId),
    );

  const creditors = balances
    .filter((b) => b.netBalance > 0)
    .map((b) => ({ memberId: b.memberId, remaining: b.netBalance }))
    .sort(
      (a, b) =>
        b.remaining - a.remaining || a.memberId.localeCompare(b.memberId),
    );

  const transfers: SimplifiedDebtTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx]!;
    const creditor = creditors[cIdx]!;
    const transferAmount = Math.min(debtor.remaining, creditor.remaining);

    if (transferAmount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: transferAmount,
      });
    }

    debtor.remaining -= transferAmount;
    creditor.remaining -= transferAmount;

    if (debtor.remaining === 0) {
      dIdx++;
    }
    if (creditor.remaining === 0) {
      cIdx++;
    }
  }

  return transfers;
}

/**
 * Flags whether an expense was edited after at least one active settlement
 * was already recorded on the trip.
 */
export function isExpenseEditedAfterSettlement(
  expense: Pick<ExpenseRecordInput, "createdAt" | "updatedAt">,
  settlements: ReadonlyArray<
    Pick<SettlementRecordInput, "createdAt" | "deletedAt">
  >,
): boolean {
  const wasEdited = expense.updatedAt.getTime() > expense.createdAt.getTime();
  if (!wasEdited) {
    return false;
  }

  return settlements.some(
    (s) => !s.deletedAt && expense.updatedAt.getTime() > s.createdAt.getTime(),
  );
}

export interface DayExpenseGroup {
  /** YYYY-MM-DD in Asia/Dhaka, or "OTHER_DATES" for out-of-range dates */
  groupKey: string;
  isOtherDates: boolean;
  dayNumber: number | null;
  label: string;
  dayTotal: number;
  /** Per-member cost for this day summed from ExpenseShare.amount */
  perPersonCost: Record<string, number>;
  expenses: ExpenseRecordInput[];
}

function diffCalendarDays(
  startYyyyMmDd: string,
  targetYyyyMmDd: string,
): number {
  const startMs = Date.parse(`${startYyyyMmDd}T00:00:00Z`);
  const targetMs = Date.parse(`${targetYyyyMmDd}T00:00:00Z`);
  return Math.round((targetMs - startMs) / (1000 * 60 * 60 * 24));
}

function formatDayGroupLabel(args: {
  dayNumber: number;
  representativeDate: Date;
  locale: SupportedLocale;
}): string {
  const formattedDate = formatDate(args.representativeDate, args.locale);
  if (args.locale === "bn") {
    return `দিন ${toBanglaDigits(args.dayNumber)} · ${formattedDate}`;
  }
  return `Day ${args.dayNumber} · ${formattedDate}`;
}

/**
 * Groups active expenses by Asia/Dhaka calendar day.
 * - If tripStartDate (and optional tripEndDate) is provided, dates inside the trip range
 *   are labeled "Day N · date" (where Day 1 is tripStartDate in Asia/Dhaka), and any
 *   expenses outside [tripStartDate, tripEndDate] are placed into the final "Other dates" group.
 * - If tripStartDate is null, distinct Asia/Dhaka dates are numbered chronologically Day 1..K.
 * - Computes dayTotal and perPersonCost (from ExpenseShare) for every group.
 */
export function groupExpensesByDhakaDay(args: {
  expenses: ExpenseRecordInput[];
  members: MemberInput[];
  tripStartDate?: Date | null;
  tripEndDate?: Date | null;
  locale: SupportedLocale;
  otherDatesLabel?: string;
}): DayExpenseGroup[] {
  const activeExpenses = args.expenses.filter((e) => !e.deletedAt);
  if (activeExpenses.length === 0) {
    return [];
  }

  const startKey = args.tripStartDate ? dayKey(args.tripStartDate) : null;
  const endKey = args.tripEndDate ? dayKey(args.tripEndDate) : null;

  const inRangeByDayKey = new Map<string, ExpenseRecordInput[]>();
  const otherDateExpenses: ExpenseRecordInput[] = [];

  for (const exp of activeExpenses) {
    const expDayKey = dayKey(exp.expenseDate);
    const beforeStart = startKey !== null && expDayKey < startKey;
    const afterEnd = endKey !== null && expDayKey > endKey;

    if (beforeStart || afterEnd) {
      otherDateExpenses.push(exp);
    } else {
      const bucket = inRangeByDayKey.get(expDayKey) ?? [];
      bucket.push(exp);
      inRangeByDayKey.set(expDayKey, bucket);
    }
  }

  const sortedDayKeys = Array.from(inRangeByDayKey.keys()).sort();
  const groups: DayExpenseGroup[] = [];

  sortedDayKeys.forEach((dKey, idx) => {
    const bucket = inRangeByDayKey.get(dKey) ?? [];
    const dayNumber =
      startKey !== null ? diffCalendarDays(startKey, dKey) + 1 : idx + 1;
    const representativeDate = new Date(`${dKey}T12:00:00+06:00`);

    const perPersonCost: Record<string, number> = {};
    for (const m of args.members) {
      perPersonCost[m.id] = 0;
    }

    let dayTotal = 0;
    for (const exp of bucket) {
      dayTotal += exp.amount;
      for (const share of exp.shares) {
        perPersonCost[share.memberId] =
          (perPersonCost[share.memberId] ?? 0) + share.amount;
      }
    }

    groups.push({
      groupKey: dKey,
      isOtherDates: false,
      dayNumber,
      label: formatDayGroupLabel({
        dayNumber,
        representativeDate,
        locale: args.locale,
      }),
      dayTotal,
      perPersonCost,
      expenses: bucket,
    });
  });

  if (otherDateExpenses.length > 0) {
    const perPersonCost: Record<string, number> = {};
    for (const m of args.members) {
      perPersonCost[m.id] = 0;
    }

    let dayTotal = 0;
    for (const exp of otherDateExpenses) {
      dayTotal += exp.amount;
      for (const share of exp.shares) {
        perPersonCost[share.memberId] =
          (perPersonCost[share.memberId] ?? 0) + share.amount;
      }
    }

    const defaultOtherLabel =
      args.locale === "bn" ? "অন্যান্য তারিখ" : "Other dates";

    groups.push({
      groupKey: "OTHER_DATES",
      isOtherDates: true,
      dayNumber: null,
      label: args.otherDatesLabel ?? defaultOtherLabel,
      dayTotal,
      perPersonCost,
      expenses: otherDateExpenses,
    });
  }

  return groups;
}
