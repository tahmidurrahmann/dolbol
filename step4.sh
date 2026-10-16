<USER_REQUEST>
#!/usr/bin/env bash
set -euo pipefail

if [ -f "./package.json" ] && [ -d "./src" ]; then
  PROJECT_DIR="."
elif [ -d "./trip-hub" ]; then
  PROJECT_DIR="./trip-hub"
else
  echo "ERROR: Run step4.sh either inside trip-hub/ or from its parent directory." >&2
  exit 1
fi

echo "==> Applying Step 4 (Safety Layer: Activity Log, Soft Delete, Edit History, Duplicate Warning & Guards) to ${PROJECT_DIR} ..."
mkdir -p \
  "${PROJECT_DIR}/docs" \
  "${PROJECT_DIR}/src/lib/__tests__" \
  "${PROJECT_DIR}/src/components" \
  "${PROJECT_DIR}/src/messages" \
  "${PROJECT_DIR}/src/app/trips/[slug]"

cat > "${PROJECT_DIR}/src/lib/safety.ts" <<'EOF'
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
  return title
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
      candidateTitleNorm.length > 0 &&
      existingTitleNorm === candidateTitleNorm;
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
  settlements: ReadonlyArray<Pick<SettlementRecordInput, "createdAt" | "deletedAt">>;
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
EOF

cat > "${PROJECT_DIR}/src/lib/__tests__/step4-safety.test.ts" <<'EOF'
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
EOF

cat > "${PROJECT_DIR}/src/messages/bn.json" <<'EOF'
{
  "app": {
    "name": "ট্রিপ হাব",
    "tagline": "বন্ধুদের সাথে ভ্রমণ পরিকল্পনা ও খরচের সহজ হিসাব",
    "createTrip": "নতুন ট্রিপ তৈরি করুন",
    "joinTrip": "ট্রিপে যোগ দিন",
    "comingSoon": "শীঘ্রই আসছে",
    "footer": "বাংলাদেশের ভ্রমণপ্রেমী বন্ধুদের জন্য তৈরি • হিসাব সবসময় পূর্ণ টাকায় (৳)"
  },
  "header": {
    "languageLabelBn": "বাংলা",
    "languageLabelEn": "English",
    "switchLanguageAria": "ভাষা পরিবর্তন করুন"
  },
  "createTrip": {
    "title": "নতুন ট্রিপ তৈরি করুন",
    "subtitle": "ট্রিপের নাম ও আপনার নাম দিন, তারপর বন্ধুদের লিংক পাঠান",
    "tripNameLabel": "ট্রিপের নাম *",
    "tripNamePlaceholder": "যেমন: সুন্দরবন ট্যুর ২০২৬",
    "destinationLabel": "গন্তব্য (ঐচ্ছিক)",
    "destinationPlaceholder": "যেমন: কক্সবাজার / শ্রীমঙ্গল",
    "startDateLabel": "শুরুর তারিখ (ঐচ্ছিক)",
    "endDateLabel": "শেষের তারিখ (ঐচ্ছিক)",
    "yourNameLabel": "আপনার নাম (ট্রিপ ক্রিয়েটর) *",
    "yourNamePlaceholder": "যেমন: করিম",
    "emojiLabel": "আপনার ইমোজি চিহ্ন",
    "pinLabel": "৪-৬ সংখ্যার পিন (ঐচ্ছিক)",
    "pinHint": "ফোন বদলালে বা ব্রাউজার ক্লিয়ার হলে নাম ফিরে পেতে কাজে লাগবে",
    "submitButton": "ট্রিপ শুরু করুন",
    "backHome": "← হোমে ফিরে যান"
  },
  "joinByLink": {
    "title": "ট্রিপে যোগ দিন",
    "subtitle": "বন্ধুর পাঠানো ট্রিপ লিংক বা কোড নিচে পেস্ট করুন",
    "inputLabel": "ট্রিপ লিংক বা স্লাগ কোড *",
    "inputPlaceholder": "https://.../trips/AbCdEf... অথবা কোড",
    "submitButton": "ট্রিপ খুঁজুন",
    "backHome": "← হোমে ফিরে যান"
  },
  "whoAreYou": {
    "title": "আপনি কে?",
    "subtitle": "এই ট্রিপে যোগ দিতে নিজের নাম বেছে নিন বা নতুন নাম লিখুন",
    "reclaimTitle": "আগে থেকেই এই ট্রিপে আছেন? নিজের নামে ট্যাপ করুন",
    "reclaimButton": "এই নামে প্রবেশ করুন",
    "pinProtected": "পিন দেওয়া আছে",
    "noPinSet": "পিন ছাড়া এক ট্যাপে প্রবেশ",
    "enterPinPlaceholder": "৪-৬ সংখ্যার পিন দিন",
    "newMemberTitle": "নতুন সদস্য হিসেবে যোগ দিন",
    "yourNameLabel": "আপনার নাম *",
    "yourNamePlaceholder": "যেমন: তানভীর",
    "emojiLabel": "ইমোজি চিহ্ন (একই নামের বন্ধু আলাদা করতে)",
    "pinLabel": "৪-৬ সংখ্যার পিন (ঐচ্ছিক)",
    "pinPlaceholder": "যেমন: ১২৩৪",
    "joinButton": "ট্রিপে যোগ দিন",
    "lockedNotice": "এই ট্রিপটি লক করা আছে। নতুন সদস্য যোগ হতে পারবে না, তবে পুরনো সদস্যরা নিজের নাম সিলেক্ট করে দেখতে পারবেন।"
  },
  "tripPage": {
    "shareTitle": "বন্ধুদের আমন্ত্রণ জানান",
    "shareSubtitle": "এই লিংকটি হোয়াটসঅ্যাপ বা মেসেঞ্জারে শেয়ার করুন (লগইন লাগবে না)",
    "copyLink": "লিংক কপি করুন",
    "copied": "কপি হয়েছে!",
    "shareNative": "শেয়ার করুন",
    "signedInAs": "আপনি যুক্ত আছেন:",
    "switchDevice": "নাম পরিবর্তন / রিক্লেইম টেস্ট করুন",
    "lockedBadge": "🔒 ট্রিপ লকড",
    "unlockedBadge": "🔓 ট্রিপ চালু",
    "destinationPrefix": "গন্তব্য:",
    "membersHeading": "ট্রিপের সদস্যবৃন্দ",
    "creatorBadge": "ক্রিয়েটর",
    "guestBadge": "গেস্ট",
    "pinSetBadge": "পিন সেট",
    "creatorControlsTitle": "ক্রিয়েটর কন্ট্রোলস",
    "addGuestTitle": "গেস্ট সদস্য যোগ করুন (যার অ্যাপ নেই)",
    "guestNamePlaceholder": "গেস্টের নাম",
    "addGuestButton": "গেস্ট যোগ করুন",
    "renameTitle": "সদস্যের নাম বা ইমোজি পরিবর্তন করুন",
    "renameSaveButton": "আপডেট করুন",
    "lockTripButton": "ট্রিপ লক করুন",
    "unlockTripButton": "ট্রিপ আনলক করুন",
    "lockTripHint": "লক করলে কেউ নতুন করে যোগ হতে বা তথ্য বদলাতে পারবে না।",
    "nextStepsTitle": "গন্তব্য ভোট ও ভ্রমণ সূচি (ধাপ ৫)",
    "nextStepsBody": "ধাপ ৫ এ গন্তব্যে ভোট দেওয়া এবং প্রতিদিনের ভ্রমণ সূচি যুক্ত হবে।"
  },
  "money": {
    "addExpenseTitle": "নতুন খরচ যোগ করুন",
    "editExpenseTitle": "খরচ এডিট করুন",
    "cancelEdit": "এডিট বাতিল করুন",
    "titleLabel": "কিসের খরচ? *",
    "titlePlaceholder": "যেমন: রাতের খাবার / সিএনজি ভাড়া",
    "amountLabel": "পরিমাণ (পূর্ণ টাকা ৳) *",
    "amountPlaceholder": "যেমন: ১২০০",
    "categoryLabel": "ধরন",
    "dateLabel": "তারিখ (ঢাকা সময়)",
    "paidByLabel": "কে টাকা দিয়েছে?",
    "splitTypeLabel": "কীভাবে ভাগ হবে?",
    "splitEqual": "সমান ভাগে",
    "splitExact": "নির্দিষ্ট টাকা",
    "splitPercent": "শতাংশ (%)",
    "participantsLabel": "কারা কারা অংশীদার?",
    "selectAll": "সবাই",
    "leftoverNote": "পূর্ণ টাকায় ভাগ করার পর অতিরিক্ত টাকা যিনি বিল দিয়েছেন তাঁর ভাগে যোগ হবে।",
    "exactSumStatus": "মোট মিলতে বাকি:",
    "percentSumStatus": "মোট শতাংশ:",
    "noteLabel": "নোট (ঐচ্ছিক)",
    "notePlaceholder": "অতিরিক্ত কোনো তথ্য...",
    "saveExpenseButton": "খরচ সেভ করুন",
    "updateExpenseButton": "খরচ আপডেট করুন",
    "cat_TRANSPORT": "🚗 যাতায়াত",
    "cat_HOTEL": "🏨 হোটেল",
    "cat_FOOD": "🍛 খাবার",
    "cat_TICKET": "🎟️ টিকিট",
    "cat_OTHER": "📦 অন্যান্য",
    "balancesTitle": "হিসাব ও লেনদেন সারসংক্ষেপ",
    "totalTripSpend": "ট্রিপের মোট খরচ",
    "whoOwesWhomTitle": "কে কাকে কত টাকা দেবে (সহজ হিসাব)",
    "allSettled": "সব হিসাব সমান! কেউ কারো কাছে টাকা পায় না।",
    "owesArrow": "দেবে",
    "memberBalancesSub": "সদস্যদের বিস্তারিত ব্যালেন্স",
    "colMember": "সদস্য",
    "colPaid": "দিয়েছে",
    "colOwed": "নিজের খরচ",
    "colNet": "নিট ব্যালেন্স",
    "statusGets": "পাবে",
    "statusOwes": "দেবে",
    "statusEven": "সমান",
    "settlementsTitle": "পরিশোধ / লেনদেন নিষ্পত্তি (Settlements)",
    "settlementSubtitle": "কেউ কাউকে টাকা ফেরত দিলে এখানে রেকর্ড করুন (এটি খরচের মধ্যে যোগ হবে না)",
    "fromMemberLabel": "কে টাকা দিল?",
    "toMemberLabel": "কে টাকা পেল?",
    "settlementAmountLabel": "টাকার পরিমাণ (৳)",
    "recordSettlementButton": "পরিশোধ রেকর্ড করুন",
    "recordedSettlementsList": "রেকর্ড করা পরিশোধসমূহ",
    "paidBackText": "পরিশোধ করেছে",
    "toText": "-কে",
    "deleteButton": "মুছুন",
    "editButton": "এডিট",
    "perDayTitle": "প্রতিদিনের খরচের হিসাব (ঢাকা সময়)",
    "noExpensesYet": "এখনো কোনো খরচ যোগ করা হয়নি।",
    "otherDatesLabel": "অন্যান্য তারিখ",
    "dayTotalLabel": "দিনের মোট:",
    "perPersonDayCostLabel": "জনপ্রতি এই দিনের খরচ:",
    "paidByPrefix": "বিল দিয়েছে:",
    "editedAfterSettlementBadge": "⚠️ লেনদেন নিষ্পত্তির পরে এডিট করা হয়েছে",
    "duplicateWarningTitle": "⚠️ সম্ভাব্য ডুপ্লিকেট খরচ!",
    "duplicateWarningBody": "একই দিনে একই টাকার আরেকটি খরচ ইতিমধ্যে যোগ করা আছে:",
    "confirmDuplicateLabel": "আমি নিশ্চিত, এটি আলাদা খরচ (তবুও সেভ করুন)",
    "editHistoryToggle": "এডিট হিস্ট্রি দেখুন",
    "editedByPrefix": "এডিট করেছেন:",
    "activityLogTitle": "অ্যাক্টিভিটি লগ ও পরিবর্তন ইতিহাস (Safety Log)",
    "activityLogSubtitle": "প্রতিটি খরচ, এডিট ও মুছে ফেলা তথ্যের অপরিবর্তনীয় রেকর্ড",
    "noActivityYet": "এখনো কোনো কার্যক্রম রেকর্ড হয়নি।",
    "act_expense_create": "নতুন খরচ যোগ করেছেন:",
    "act_expense_update": "খরচ এডিট করেছেন:",
    "act_expense_delete": "খরচ মুছে ফেলেছেন (Soft-deleted):",
    "act_settlement_create": "পরিশোধ রেকর্ড করেছেন:",
    "act_settlement_delete": "পরিশোধ মুছে ফেলেছেন (Soft-deleted):",
    "act_member_join": "ট্রিপে যোগ দিয়েছেন:",
    "act_member_create_guest": "গেস্ট সদস্য যোগ করেছেন:",
    "act_member_update": "সদস্যের নাম/ইমোজি পরিবর্তন করেছেন:",
    "act_trip_create": "ট্রিপ তৈরি করেছেন:",
    "act_trip_lock": "ট্রিপ লক করেছেন",
    "act_trip_unlock": "ট্রিপ আনলক করেছেন"
  },
  "errors": {
    "invalid_input": "তথ্যগুলো সঠিকভাবে পূরণ করুন।",
    "invalid_pin": "পিন অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।",
    "wrong_pin": "পিনটি সঠিক নয়। আবার চেষ্টা করুন।",
    "duplicate_name": "এই নামে একজন সদস্য ইতিমধ্যে আছেন! নিচের তালিকা থেকে নামটি বেছে নিন অথবা নামের সাথে ডাকনাম/ইনিশিয়াল যোগ করুন।",
    "trip_not_found": "এই লিংকে কোনো ট্রিপ পাওয়া যায়নি।",
    "trip_locked": "ট্রিপটি লক করা আছে, তাই পরিবর্তন করা যাবে না।",
    "not_creator": "শুধুমাত্র ট্রিপ ক্রিয়েটর এই কাজটি করতে পারবেন।",
    "invalid_amount": "টাকার পরিমাণ অবশ্যই ১ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।",
    "invalid_shares": "ভাগের হিসাব মেলেনি (সমান ভাগে অন্তত ১ জন, নির্দিষ্ট টাকায় মোট খরচের সমান, এবং শতাংশে মোট ১০০% হতে হবে)।",
    "same_member_settlement": "যিনি টাকা দিচ্ছেন এবং যিনি পাচ্ছেন তাঁরা একই ব্যক্তি হতে পারবেন না।",
    "unauthorized": "খরচ যোগ করতে আগে নিজের নামে ট্রিপে প্রবেশ করুন।",
    "duplicate_expense_warning": "একই দিনে একই টাকার ও একই ধরনের একটি খরচ ইতিমধ্যে আছে! এটি আলাদা খরচ হলে ফর্মে 'আমি নিশ্চিত' টিক দিয়ে সেভ করুন।",
    "cross_trip_option": "এই ভোট অপশনটি এই ট্রিপের নয়।"
  }
}
EOF

cat > "${PROJECT_DIR}/src/messages/en.json" <<'EOF'
{
  "app": {
    "name": "Trip Hub",
    "tagline": "Plan group trips and split expenses with friends effortlessly",
    "createTrip": "Create a trip",
    "joinTrip": "Join a trip",
    "comingSoon": "Coming soon",
    "footer": "Built for friend groups in Bangladesh • All amounts in whole BDT (৳)"
  },
  "header": {
    "languageLabelBn": "বাংলা",
    "languageLabelEn": "English",
    "switchLanguageAria": "Switch language"
  },
  "createTrip": {
    "title": "Create a new trip",
    "subtitle": "Enter the trip name and your name, then share the link with friends",
    "tripNameLabel": "Trip name *",
    "tripNamePlaceholder": "e.g., Sundarbans Tour 2026",
    "destinationLabel": "Destination (optional)",
    "destinationPlaceholder": "e.g., Cox's Bazar / Sreemangal",
    "startDateLabel": "Start date (optional)",
    "endDateLabel": "End date (optional)",
    "yourNameLabel": "Your name (Trip creator) *",
    "yourNamePlaceholder": "e.g., Karim",
    "emojiLabel": "Your emoji tag",
    "pinLabel": "4–6 digit PIN (optional)",
    "pinHint": "Helps you reclaim your name if you clear browser data or switch phones",
    "submitButton": "Start trip",
    "backHome": "← Back to home"
  },
  "joinByLink": {
    "title": "Join a trip",
    "subtitle": "Paste the shared trip link or slug code from your friend below",
    "inputLabel": "Trip link or slug code *",
    "inputPlaceholder": "https://.../trips/AbCdEf... or code",
    "submitButton": "Find trip",
    "backHome": "← Back to home"
  },
  "whoAreYou": {
    "title": "Who are you?",
    "subtitle": "Pick your existing name or join as a new member on this trip",
    "reclaimTitle": "Already on this trip? Tap your name to rejoin",
    "reclaimButton": "Continue as this member",
    "pinProtected": "PIN protected",
    "noPinSet": "One-tap rejoin (no PIN)",
    "enterPinPlaceholder": "Enter 4–6 digit PIN",
    "newMemberTitle": "Join as a new member",
    "yourNameLabel": "Your name *",
    "yourNamePlaceholder": "e.g., Tanvir",
    "emojiLabel": "Emoji tag (helps tell same-named friends apart)",
    "pinLabel": "4–6 digit PIN (optional)",
    "pinPlaceholder": "e.g., 1234",
    "joinButton": "Join trip",
    "lockedNotice": "This trip is locked. New members cannot join, but existing members can still reclaim their name above."
  },
  "tripPage": {
    "shareTitle": "Invite your friends",
    "shareSubtitle": "Share this link on WhatsApp or Messenger (no login needed)",
    "copyLink": "Copy link",
    "copied": "Copied!",
    "shareNative": "Share link",
    "signedInAs": "Signed in as:",
    "switchDevice": "Switch member / Test reclaim",
    "lockedBadge": "🔒 Trip Locked",
    "unlockedBadge": "🔓 Active",
    "destinationPrefix": "Destination:",
    "membersHeading": "Trip Members",
    "creatorBadge": "Creator",
    "guestBadge": "Guest",
    "pinSetBadge": "PIN set",
    "creatorControlsTitle": "Creator Controls",
    "addGuestTitle": "Add a guest member (friend without the app)",
    "guestNamePlaceholder": "Guest display name",
    "addGuestButton": "Add guest",
    "renameTitle": "Rename or update emoji for a member",
    "renameSaveButton": "Save changes",
    "lockTripButton": "Lock trip",
    "unlockTripButton": "Unlock trip",
    "lockTripHint": "Locking prevents new members, guests, or edits.",
    "nextStepsTitle": "Destination Voting & Itinerary (Step 5)",
    "nextStepsBody": "Destination voting and day-by-day itinerary planning come in Step 5."
  },
  "money": {
    "addExpenseTitle": "Add an Expense",
    "editExpenseTitle": "Edit Expense",
    "cancelEdit": "Cancel edit",
    "titleLabel": "What was it for? *",
    "titlePlaceholder": "e.g., Seafood dinner / CNG fare",
    "amountLabel": "Amount (whole BDT ৳) *",
    "amountPlaceholder": "e.g., 1200",
    "categoryLabel": "Category",
    "dateLabel": "Date (Dhaka time)",
    "paidByLabel": "Who paid?",
    "splitTypeLabel": "How is it split?",
    "splitEqual": "Equal",
    "splitExact": "Exact (৳)",
    "splitPercent": "Percent (%)",
    "participantsLabel": "Who shared this expense?",
    "selectAll": "Everyone",
    "leftoverNote": "Any integer rounding leftover (1–2 ৳) goes to the payer.",
    "exactSumStatus": "Remaining to match total:",
    "percentSumStatus": "Total percentage:",
    "noteLabel": "Note (optional)",
    "notePlaceholder": "Optional details...",
    "saveExpenseButton": "Save expense",
    "updateExpenseButton": "Update expense",
    "cat_TRANSPORT": "🚗 Transport",
    "cat_HOTEL": "🏨 Hotel",
    "cat_FOOD": "🍛 Food",
    "cat_TICKET": "🎟️ Ticket",
    "cat_OTHER": "📦 Other",
    "balancesTitle": "Balances & Debt Summary",
    "totalTripSpend": "Total Trip Spend",
    "whoOwesWhomTitle": "Who Owes Whom (Simplified)",
    "allSettled": "Everyone is settled up! No pending debts.",
    "owesArrow": "owes",
    "memberBalancesSub": "Per-Member Breakdown",
    "colMember": "Member",
    "colPaid": "Paid",
    "colOwed": "Share",
    "colNet": "Net",
    "statusGets": "gets",
    "statusOwes": "owes",
    "statusEven": "even",
    "settlementsTitle": "Settlements (Repayments)",
    "settlementSubtitle": "Record direct repayments between friends (kept separate from trip expenses)",
    "fromMemberLabel": "Who paid back?",
    "toMemberLabel": "Who received it?",
    "settlementAmountLabel": "Amount (৳)",
    "recordSettlementButton": "Record repayment",
    "recordedSettlementsList": "Recorded Settlements",
    "paidBackText": "paid back",
    "toText": "to",
    "deleteButton": "Delete",
    "editButton": "Edit",
    "perDayTitle": "Per-Day Cost Breakdown (Asia/Dhaka)",
    "noExpensesYet": "No expenses logged yet.",
    "otherDatesLabel": "Other dates",
    "dayTotalLabel": "Day total:",
    "perPersonDayCostLabel": "Per-person cost this day:",
    "paidByPrefix": "Paid by:",
    "editedAfterSettlementBadge": "⚠️ Edited after a settlement",
    "duplicateWarningTitle": "⚠️ Possible Duplicate Expense!",
    "duplicateWarningBody": "An expense with the same amount on the same day already exists:",
    "confirmDuplicateLabel": "I confirm this is a separate expense (save anyway)",
    "editHistoryToggle": "View edit history",
    "editedByPrefix": "Edited by:",
    "activityLogTitle": "Activity Log & Audit Trail",
    "activityLogSubtitle": "Immutable record of every expense, settlement, edit, and soft-delete",
    "noActivityYet": "No activity recorded yet.",
    "act_expense_create": "added expense:",
    "act_expense_update": "edited expense:",
    "act_expense_delete": "soft-deleted expense:",
    "act_settlement_create": "recorded repayment:",
    "act_settlement_delete": "soft-deleted repayment:",
    "act_member_join": "joined the trip:",
    "act_member_create_guest": "added guest member:",
    "act_member_update": "updated member name/emoji:",
    "act_trip_create": "created trip:",
    "act_trip_lock": "locked the trip",
    "act_trip_unlock": "unlocked the trip"
  },
  "errors": {
    "invalid_input": "Please fill in the required fields properly.",
    "invalid_pin": "PIN must be 4 to 6 digits.",
    "wrong_pin": "Incorrect PIN. Please try again.",
    "duplicate_name": "Someone with this name is already on the trip! Reclaim your name from the list above or add a last initial.",
    "trip_not_found": "No trip was found for that link or code.",
    "trip_locked": "This trip is locked and cannot be modified.",
    "not_creator": "Only the trip creator can perform this action.",
    "invalid_amount": "Amount must be a positive whole-taka integer.",
    "invalid_shares": "Split shares do not match (select at least 1 member for Equal, match exact total for Exact, or sum to 100% for Percent).",
    "same_member_settlement": "Payer and receiver cannot be the same member.",
    "unauthorized": "Please join or select your name on this trip first.",
    "duplicate_expense_warning": "A matching expense with the same amount on the same day already exists! Check 'I confirm this is a separate expense' in the form to save anyway.",
    "cross_trip_option": "That destination vote option does not belong to this trip."
  }
}
EOF

cat > "${PROJECT_DIR}/src/components/ExpenseFormCard.tsx" <<'EOF'
"use client";

import Link from "next/link";
import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import type {
  ExpenseCategoryValue,
  MemberInput,
  ShareOutput,
  SplitTypeValue,
} from "@/lib/money";

export interface EditableExpenseData {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDateYyyyMmDd: string;
  paidById: string;
  splitType: SplitTypeValue;
  note: string | null;
  shares: ShareOutput[];
}

export interface ExistingExpenseSummary {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryValue;
  expenseDateYyyyMmDd: string;
  paidById: string;
}

export interface ExpenseFormLabels {
  addExpenseTitle: string;
  editExpenseTitle: string;
  cancelEdit: string;
  titleLabel: string;
  titlePlaceholder: string;
  amountLabel: string;
  amountPlaceholder: string;
  categoryLabel: string;
  dateLabel: string;
  paidByLabel: string;
  splitTypeLabel: string;
  splitEqual: string;
  splitExact: string;
  splitPercent: string;
  participantsLabel: string;
  selectAll: string;
  leftoverNote: string;
  exactSumStatus: string;
  percentSumStatus: string;
  noteLabel: string;
  notePlaceholder: string;
  saveExpenseButton: string;
  updateExpenseButton: string;
  duplicateWarningTitle: string;
  duplicateWarningBody: string;
  confirmDuplicateLabel: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface ExpenseFormCardProps {
  slug: string;
  members: MemberInput[];
  currentMemberId: string;
  defaultDateYyyyMmDd: string;
  editingExpense: EditableExpenseData | null;
  existingExpenses: ExistingExpenseSummary[];
  forceShowDuplicateConfirm?: boolean;
  labels: ExpenseFormLabels;
}

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function toAsciiNumber(raw: string): number {
  const ascii = raw
    .replace(/[০-৯]/g, (c) => String(BANGLA_DIGITS.indexOf(c)))
    .replace(/,/g, "")
    .trim();
  const n = Number(ascii);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTitle(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function ExpenseFormCard({
  slug,
  members,
  currentMemberId,
  defaultDateYyyyMmDd,
  editingExpense,
  existingExpenses,
  forceShowDuplicateConfirm = false,
  labels,
}: ExpenseFormCardProps) {
  const [titleStr, setTitleStr] = useState<string>(
    editingExpense?.title ?? "",
  );
  const [splitType, setSplitType] = useState<SplitTypeValue>(
    editingExpense?.splitType ?? "EQUAL",
  );
  const [amountStr, setAmountStr] = useState<string>(
    editingExpense ? String(editingExpense.amount) : "",
  );
  const [categoryVal, setCategoryVal] = useState<ExpenseCategoryValue>(
    editingExpense?.category ?? "FOOD",
  );
  const [dateStr, setDateStr] = useState<string>(
    editingExpense?.expenseDateYyyyMmDd ?? defaultDateYyyyMmDd,
  );
  const [paidByVal, setPaidByVal] = useState<string>(
    editingExpense?.paidById ?? currentMemberId,
  );

  const initialSelectedIds = editingExpense
    ? editingExpense.shares.map((s) => s.memberId)
    : members.map((m) => m.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const initialExactMap: Record<string, string> = {};
  if (editingExpense && editingExpense.splitType === "EXACT") {
    for (const s of editingExpense.shares) {
      initialExactMap[s.memberId] = String(s.amount);
    }
  }
  const [exactValues, setExactValues] =
    useState<Record<string, string>>(initialExactMap);

  const initialPercentMap: Record<string, string> = {};
  if (editingExpense && editingExpense.splitType === "PERCENT") {
    for (const s of editingExpense.shares) {
      const pct =
        editingExpense.amount > 0
          ? Math.round((s.amount / editingExpense.amount) * 100)
          : 0;
      initialPercentMap[s.memberId] = String(pct);
    }
  }
  const [percentValues, setPercentValues] =
    useState<Record<string, string>>(initialPercentMap);

  const totalAmount = Math.trunc(toAsciiNumber(amountStr));
  const exactSum = members.reduce(
    (sum, m) => sum + Math.trunc(toAsciiNumber(exactValues[m.id] ?? "")),
    0,
  );
  const percentSum = members.reduce(
    (sum, m) => sum + toAsciiNumber(percentValues[m.id] ?? ""),
    0,
  );

  // Live client-side duplicate detection matching findDuplicateExpenseCandidate
  const candidateNormTitle = normalizeTitle(titleStr);
  const matchingDuplicate =
    totalAmount > 0
      ? existingExpenses.find((exp) => {
          if (editingExpense && exp.id === editingExpense.id) {
            return false;
          }
          if (exp.amount !== totalAmount) {
            return false;
          }
          if (exp.expenseDateYyyyMmDd !== dateStr) {
            return false;
          }
          const sameTitle =
            candidateNormTitle.length > 0 &&
            normalizeTitle(exp.title) === candidateNormTitle;
          const samePayerAndCat =
            exp.paidById === paidByVal && exp.category === categoryVal;
          return sameTitle || samePayerAndCat;
        }) ?? null
      : null;

  const showDuplicateWarning =
    Boolean(matchingDuplicate) || forceShowDuplicateConfirm;

  function toggleParticipant(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {editingExpense ? labels.editExpenseTitle : labels.addExpenseTitle}
        </h2>
        {editingExpense ? (
          <Link
            href={`/trips/${slug}`}
            className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            {labels.cancelEdit}
          </Link>
        ) : null}
      </div>

      <form action={saveExpenseAction} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        {editingExpense ? (
          <input type="hidden" name="expenseId" value={editingExpense.id} />
        ) : null}
        <input type="hidden" name="splitType" value={splitType} />

        <div className="space-y-1.5">
          <label
            htmlFor="exp-title"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.titleLabel}
          </label>
          <input
            id="exp-title"
            name="title"
            type="text"
            required
            maxLength={100}
            value={titleStr}
            onChange={(e) => setTitleStr(e.target.value)}
            placeholder={labels.titlePlaceholder}
            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="exp-amount"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.amountLabel}
            </label>
            <input
              id="exp-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={labels.amountPlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base font-semibold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="exp-category"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.categoryLabel}
            </label>
            <select
              id="exp-category"
              name="category"
              value={categoryVal}
              onChange={(e) =>
                setCategoryVal(e.target.value as ExpenseCategoryValue)
              }
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              {(
                Object.keys(labels.categories) as ExpenseCategoryValue[]
              ).map((cat) => (
                <option key={cat} value={cat}>
                  {labels.categories[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="exp-date"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.dateLabel}
            </label>
            <input
              id="exp-date"
              name="expenseDate"
              type="date"
              required
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="exp-paidBy"
              className="block text-sm font-semibold text-[var(--color-fg)]"
            >
              {labels.paidByLabel}
            </label>
            <select
              id="exp-paidBy"
              name="paidById"
              value={paidByVal}
              onChange={(e) => setPaidByVal(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji ?? "🎒"} {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Split Type selector */}
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-[var(--color-fg)]">
            {labels.splitTypeLabel}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["EQUAL", labels.splitEqual],
                ["EXACT", labels.splitExact],
                ["PERCENT", labels.splitPercent],
              ] as const
            ).map(([type, text]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`min-h-[44px] rounded-lg border px-2 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  splitType === type
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* EQUAL Split Participants */}
        {splitType === "EQUAL" ? (
          <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-fg)]">
                {labels.participantsLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(members.map((m) => m.id))}
                className="text-xs font-semibold text-[var(--color-primary)] underline"
              >
                {labels.selectAll}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {members.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                      checked
                        ? "border-[var(--color-primary)] bg-white text-[var(--color-fg)]"
                        : "border-[var(--color-border)] bg-transparent text-[var(--color-fg-muted)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="participantIds"
                      value={m.id}
                      checked={checked}
                      onChange={() => toggleParticipant(m.id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span className="truncate">
                      {m.emoji ?? "🎒"} {m.displayName}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {labels.leftoverNote}
            </p>
          </div>
        ) : null}

        {/* EXACT Split Inputs */}
        {splitType === "EXACT" ? (
          <div className="space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{labels.exactSumStatus}</span>
              <span
                className={
                  totalAmount - exactSum === 0
                    ? "text-[var(--color-primary)]"
                    : "text-red-700"
                }
              >
                ৳{totalAmount - exactSum}
              </span>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <label
                    htmlFor={`exact_${m.id}`}
                    className="flex-1 truncate text-sm font-medium text-[var(--color-fg)]"
                  >
                    {m.emoji ?? "🎒"} {m.displayName}
                  </label>
                  <input
                    id={`exact_${m.id}`}
                    name={`exact_${m.id}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={exactValues[m.id] ?? ""}
                    onChange={(e) =>
                      setExactValues((prev) => ({
                        ...prev,
                        [m.id]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-right text-base text-[var(--color-fg)]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PERCENT Split Inputs */}
        {splitType === "PERCENT" ? (
          <div className="space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{labels.percentSumStatus}</span>
              <span
                className={
                  Math.round(percentSum * 100) === 10000
                    ? "text-[var(--color-primary)]"
                    : "text-red-700"
                }
              >
                {percentSum}% / 100%
              </span>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <label
                    htmlFor={`percent_${m.id}`}
                    className="flex-1 truncate text-sm font-medium text-[var(--color-fg)]"
                  >
                    {m.emoji ?? "🎒"} {m.displayName}
                  </label>
                  <input
                    id={`percent_${m.id}`}
                    name={`percent_${m.id}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0%"
                    value={percentValues[m.id] ?? ""}
                    onChange={(e) =>
                      setPercentValues((prev) => ({
                        ...prev,
                        [m.id]: e.target.value,
                      }))
                    }
                    className="min-h-[44px] w-28 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-right text-base text-[var(--color-fg)]"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor="exp-note"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.noteLabel}
          </label>
          <input
            id="exp-note"
            name="note"
            type="text"
            maxLength={200}
            defaultValue={editingExpense?.note ?? ""}
            placeholder={labels.notePlaceholder}
            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {/* Step 4: Duplicate-entry Warning Banner & Confirm Override Checkbox */}
        {showDuplicateWarning ? (
          <div className="space-y-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-950">
            <p className="text-sm font-bold">{labels.duplicateWarningTitle}</p>
            {matchingDuplicate ? (
              <p className="text-xs">
                {labels.duplicateWarningBody}{" "}
                <strong>
                  &ldquo;{matchingDuplicate.title}&rdquo; (৳
                  {matchingDuplicate.amount})
                </strong>
              </p>
            ) : null}
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 pt-1 text-sm font-semibold">
              <input
                type="checkbox"
                name="confirmDuplicate"
                value="true"
                required
                className="h-4 w-4 accent-amber-700"
              />
              <span>{labels.confirmDuplicateLabel}</span>
            </label>
          </div>
        ) : null}

        <Button type="submit" variant="primary">
          {editingExpense
            ? labels.updateExpenseButton
            : labels.saveExpenseButton}
        </Button>
      </form>
    </div>
  );
}
EOF

cat > "${PROJECT_DIR}/src/components/PerDayExpensesView.tsx" <<'EOF'
import Link from "next/link";
import { deleteExpenseAction } from "@/app/trips/actions";
import {
  formatDate,
  formatTaka,
  type SupportedLocale,
} from "@/lib/format";
import {
  type DayExpenseGroup,
  type ExpenseCategoryValue,
  isExpenseEditedAfterSettlement,
  type MemberInput,
  type SettlementRecordInput,
} from "@/lib/money";
import {
  type ActivityLogRecordInput,
  extractExpenseEditHistory,
} from "@/lib/safety";

interface PerDayExpensesViewLabels {
  perDayTitle: string;
  noExpensesYet: string;
  dayTotalLabel: string;
  perPersonDayCostLabel: string;
  paidByPrefix: string;
  editedAfterSettlementBadge: string;
  editHistoryToggle: string;
  editedByPrefix: string;
  editButton: string;
  deleteButton: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface PerDayExpensesViewProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  members: MemberInput[];
  dayGroups: DayExpenseGroup[];
  settlements: SettlementRecordInput[];
  activityLogs: ActivityLogRecordInput[];
  labels: PerDayExpensesViewLabels;
}

export function PerDayExpensesView({
  slug,
  locale,
  isLocked,
  members,
  dayGroups,
  settlements,
  activityLogs,
  labels,
}: PerDayExpensesViewProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-lg font-bold text-[var(--color-fg)]">
        {labels.perDayTitle}
      </h2>

      {dayGroups.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-4 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noExpensesYet}
        </p>
      ) : (
        <div className="space-y-5">
          {dayGroups.map((group) => (
            <div
              key={group.groupKey}
              className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
            >
              {/* Day Header & Day Total */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                <h3 className="text-base font-bold text-[var(--color-fg)]">
                  {group.label}
                </h3>
                <div className="text-sm font-bold text-[var(--color-primary)]">
                  {labels.dayTotalLabel} {formatTaka(group.dayTotal, locale)}
                </div>
              </div>

              {/* Per-Person Cost Pills from ExpenseShare */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--color-fg-muted)]">
                  {labels.perPersonDayCostLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const cost = group.perPersonCost[m.id] ?? 0;
                    if (cost === 0) return null;
                    return (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-fg)]"
                      >
                        <span>
                          {m.emoji ?? "🎒"} {m.displayName}:
                        </span>
                        <span className="font-bold text-[var(--color-primary)]">
                          {formatTaka(cost, locale)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Expenses List for this Day */}
              <ul className="space-y-2.5 pt-1">
                {group.expenses.map((exp) => {
                  const payer = memberById.get(exp.paidById);
                  const editHistory = extractExpenseEditHistory({
                    expenseId: exp.id,
                    activityLogs,
                    settlements,
                  });
                  const editedAfterSettlement =
                    isExpenseEditedAfterSettlement(exp, settlements) ||
                    editHistory.some((h) => h.editedAfterSettlement);

                  return (
                    <li
                      key={exp.id}
                      className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--color-fg-muted)]">
                              {labels.categories[exp.category]}
                            </span>
                            <span className="font-bold text-[var(--color-fg)]">
                              {exp.title}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                            {labels.paidByPrefix} {payer?.emoji ?? "🎒"}{" "}
                            {payer?.displayName ?? exp.paidById}
                          </p>
                        </div>

                        <div className="text-right font-bold text-[var(--color-fg)]">
                          {formatTaka(exp.amount, locale)}
                        </div>
                      </div>

                      {editedAfterSettlement ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          {labels.editedAfterSettlementBadge}
                        </div>
                      ) : null}

                      {exp.note ? (
                        <p className="text-xs italic text-[var(--color-fg-muted)]">
                          {exp.note}
                        </p>
                      ) : null}

                      {/* Individual Share Breakdown */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {exp.shares.map((sh) => {
                          const participant = memberById.get(sh.memberId);
                          return (
                            <span
                              key={sh.memberId}
                              className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-fg-muted)]"
                            >
                              {participant?.emoji ?? "🎒"}{" "}
                              {participant?.displayName}:{" "}
                              {formatTaka(sh.amount, locale)}
                            </span>
                          );
                        })}
                      </div>

                      {/* Step 4: Expandable Edit History Diff */}
                      {editHistory.length > 0 ? (
                        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs">
                          <summary className="cursor-pointer font-semibold text-[var(--color-fg)]">
                            {labels.editHistoryToggle} ({editHistory.length})
                          </summary>
                          <ul className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
                            {editHistory.map((h) => {
                              const editor = h.editorMemberId
                                ? memberById.get(h.editorMemberId)
                                : undefined;
                              return (
                                <li
                                  key={h.logId}
                                  className="space-y-0.5 text-[var(--color-fg-muted)]"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span>
                                      {labels.editedByPrefix}{" "}
                                      <strong className="text-[var(--color-fg)]">
                                        {editor
                                          ? `${editor.emoji ?? "🎒"} ${editor.displayName}`
                                          : "—"}
                                      </strong>
                                    </span>
                                    <span>{formatDate(h.editedAt, locale)}</span>
                                  </div>
                                  <div className="font-medium text-[var(--color-fg)]">
                                    {h.beforeTitle !== h.afterTitle &&
                                    h.beforeTitle &&
                                    h.afterTitle ? (
                                      <span>
                                        &ldquo;{h.beforeTitle}&rdquo; → &ldquo;
                                        {h.afterTitle}&rdquo;{" "}
                                      </span>
                                    ) : null}
                                    {typeof h.beforeAmount === "number" &&
                                    typeof h.afterAmount === "number" &&
                                    h.beforeAmount !== h.afterAmount ? (
                                      <span>
                                        {formatTaka(h.beforeAmount, locale)} →{" "}
                                        {formatTaka(h.afterAmount, locale)}
                                      </span>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ) : null}

                      {!isLocked ? (
                        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-2">
                          <Link
                            href={`/trips/${slug}?editExpense=${exp.id}#expense-form`}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-border)]"
                          >
                            {labels.editButton}
                          </Link>

                          <form action={deleteExpenseAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="expenseId"
                              value={exp.id}
                            />
                            <button
                              type="submit"
                              className="inline-flex min-h-[36px] items-center rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              {labels.deleteButton}
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
EOF

cat > "${PROJECT_DIR}/src/components/ActivityLogCard.tsx" <<'EOF'
import {
  formatDate,
  formatTaka,
  type SupportedLocale,
} from "@/lib/format";
import type { MemberInput } from "@/lib/money";
import type { ActivityLogRecordInput } from "@/lib/safety";

export interface ActivityLogCardLabels {
  activityLogTitle: string;
  activityLogSubtitle: string;
  noActivityYet: string;
  act_expense_create: string;
  act_expense_update: string;
  act_expense_delete: string;
  act_settlement_create: string;
  act_settlement_delete: string;
  act_member_join: string;
  act_member_create_guest: string;
  act_member_update: string;
  act_trip_create: string;
  act_trip_lock: string;
  act_trip_unlock: string;
}

interface ActivityLogCardProps {
  locale: SupportedLocale;
  members: MemberInput[];
  activityLogs: ActivityLogRecordInput[];
  labels: ActivityLogCardLabels;
}

export function ActivityLogCard({
  locale,
  members,
  activityLogs,
  labels,
}: ActivityLogCardProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));

  function describeLog(log: ActivityLogRecordInput): string {
    const key = `${log.entityType}_${log.action}`;
    switch (key) {
      case "expense_create": {
        const title = log.after?.title ?? "";
        const amt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_expense_create} "${title}" (${amt})`;
      }
      case "expense_update": {
        const beforeTitle = log.before?.title ?? "";
        const afterTitle = log.after?.title ?? beforeTitle;
        const beforeAmt =
          typeof log.before?.amount === "number"
            ? formatTaka(log.before.amount, locale)
            : "";
        const afterAmt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_expense_update} "${afterTitle}" (${beforeAmt} → ${afterAmt})`;
      }
      case "expense_delete": {
        const title = log.before?.title ?? log.after?.title ?? "";
        const amtVal = log.before?.amount ?? log.after?.amount;
        const amt =
          typeof amtVal === "number" ? formatTaka(amtVal, locale) : "";
        return `${labels.act_expense_delete} "${title}" (${amt})`;
      }
      case "settlement_create": {
        const from = log.after?.fromMemberId
          ? memberById.get(log.after.fromMemberId)?.displayName
          : "";
        const to = log.after?.toMemberId
          ? memberById.get(log.after.toMemberId)?.displayName
          : "";
        const amt =
          typeof log.after?.amount === "number"
            ? formatTaka(log.after.amount, locale)
            : "";
        return `${labels.act_settlement_create} ${from ?? ""} → ${to ?? ""} (${amt})`;
      }
      case "settlement_delete": {
        const from = log.before?.fromMemberId
          ? memberById.get(log.before.fromMemberId)?.displayName
          : "";
        const to = log.before?.toMemberId
          ? memberById.get(log.before.toMemberId)?.displayName
          : "";
        const amtVal = log.before?.amount ?? log.after?.amount;
        const amt =
          typeof amtVal === "number" ? formatTaka(amtVal, locale) : "";
        return `${labels.act_settlement_delete} ${from ?? ""} → ${to ?? ""} (${amt})`;
      }
      case "member_join":
        return `${labels.act_member_join} ${log.after?.displayName ?? ""}`;
      case "member_create_guest":
        return `${labels.act_member_create_guest} ${log.after?.displayName ?? ""}`;
      case "member_update":
        return `${labels.act_member_update} ${log.before?.displayName ?? ""} → ${log.after?.displayName ?? ""}`;
      case "trip_create":
        return `${labels.act_trip_create} "${log.after?.name ?? ""}"`;
      case "trip_lock":
        return labels.act_trip_lock;
      case "trip_unlock":
        return labels.act_trip_unlock;
      default:
        return `${log.entityType} (${log.action})`;
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-0.5">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.activityLogTitle}
        </h2>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {labels.activityLogSubtitle}
        </p>
      </div>

      {activityLogs.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-sm text-[var(--color-fg-muted)]">
          {labels.noActivityYet}
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {activityLogs.map((log) => {
            const actor = log.memberId
              ? memberById.get(log.memberId)
              : undefined;
            const isDelete = log.action === "delete";
            const isUpdate = log.action === "update";

            return (
              <li
                key={log.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isDelete
                    ? "border-red-200 bg-red-50/60 text-red-950"
                    : isUpdate
                      ? "border-amber-200 bg-amber-50/60 text-amber-950"
                      : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span>
                    {actor
                      ? `${actor.emoji ?? "🎒"} ${actor.displayName}`
                      : "System"}
                  </span>
                  <span className="font-normal text-[var(--color-fg-muted)]">
                    {formatDate(log.createdAt, locale)}
                  </span>
                </div>
                <p className="mt-0.5">{describeLog(log)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
EOF

cat > "${PROJECT_DIR}/src/app/trips/actions.ts" <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  banglaToAsciiDigits,
  extractSlugFromInput,
  generateTripSlug,
  hashPin,
  normalizeNameKey,
  verifyPin,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  computeExpenseShares,
  type ExactShareInput,
  type ExpenseCategoryValue,
  type PercentShareInput,
  type ShareOutput,
} from "@/lib/money";
import {
  assertTripWritable,
  assertValidExpenseSharesForTrip,
  assertVoteOptionBelongsToTrip,
  findDuplicateExpenseCandidate,
  SafetyViolationError,
} from "@/lib/safety";
import {
  clearMemberDeviceSession,
  createMemberDeviceSession,
  getCurrentMemberForTrip,
} from "@/lib/session";
import {
  addGuestFormSchema,
  createTripFormSchema,
  expenseFormSchema,
  joinTripFormSchema,
  reclaimMemberFormSchema,
  renameMemberFormSchema,
  settlementFormSchema,
} from "@/lib/trips";

function parseOptionalDhakaDate(yyyyMmDd: string | undefined): Date | null {
  if (!yyyyMmDd) {
    return null;
  }
  return new Date(`${yyyyMmDd}T00:00:00+06:00`);
}

function parseDhakaExpenseDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00+06:00`);
}

export async function createTripAction(formData: FormData): Promise<void> {
  const parsed = createTripFormSchema.safeParse({
    name: formData.get("name") ?? "",
    destination: formData.get("destination") ?? undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
    creatorName: formData.get("creatorName") ?? "",
    creatorEmoji: formData.get("creatorEmoji") ?? "🎒",
    creatorPin: formData.get("creatorPin") ?? undefined,
  });

  if (!parsed.success) {
    const hasPinErr = parsed.error.issues.some(
      (i) => i.message === "invalid_pin",
    );
    const code = hasPinErr ? "invalid_pin" : "invalid_input";
    redirect(`/trips/new?error=${code}`);
  }

  const {
    name,
    destination,
    startDate,
    endDate,
    creatorName,
    creatorEmoji,
    creatorPin,
  } = parsed.data;

  const slug = generateTripSlug();
  const nameKey = normalizeNameKey(creatorName);
  const pinHash = creatorPin ? hashPin(creatorPin) : null;

  const result = await db.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        slug,
        name,
        destination: destination ?? null,
        startDate: parseOptionalDhakaDate(startDate),
        endDate: parseOptionalDhakaDate(endDate),
      },
    });

    const creator = await tx.member.create({
      data: {
        tripId: trip.id,
        displayName: creatorName.trim(),
        nameKey,
        emoji: creatorEmoji,
        isGuest: false,
        pinHash,
      },
    });

    const updatedTrip = await tx.trip.update({
      where: { id: trip.id },
      data: { creatorMemberId: creator.id },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: creator.id,
        entityType: "trip",
        entityId: trip.id,
        action: "create",
        after: {
          name: updatedTrip.name,
          destination: updatedTrip.destination,
          displayName: creator.displayName,
        },
      },
    });

    return { trip: updatedTrip, creator };
  });

  await createMemberDeviceSession(result.creator.id, result.trip.id);
  redirect(`/trips/${result.trip.slug}`);
}

export async function lookupTripByLinkAction(
  formData: FormData,
): Promise<void> {
  const raw = String(formData.get("tripLinkOrSlug") ?? "");
  const slug = extractSlugFromInput(raw);

  if (!slug) {
    redirect("/trips/join?error=trip_not_found");
  }

  const trip = await db.trip.findUnique({
    where: { slug },
    select: { slug: true },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  redirect(`/trips/${trip.slug}`);
}

export async function joinTripAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = joinTripFormSchema.safeParse({
    slug,
    displayName: formData.get("displayName") ?? "",
    emoji: formData.get("emoji") ?? "🎒",
    pin: formData.get("pin") ?? undefined,
  });

  if (!parsed.success) {
    const hasPinErr = parsed.error.issues.some(
      (i) => i.message === "invalid_pin",
    );
    const code = hasPinErr ? "invalid_pin" : "invalid_input";
    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const displayName = parsed.data.displayName.trim();
  const nameKey = normalizeNameKey(displayName);
  const existing = await db.member.findUnique({
    where: {
      tripId_nameKey: {
        tripId: trip.id,
        nameKey,
      },
    },
  });

  if (existing) {
    redirect(`/trips/${trip.slug}?error=duplicate_name`);
  }

  const pinHash = parsed.data.pin ? hashPin(parsed.data.pin) : null;

  const member = await db.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        tripId: trip.id,
        displayName,
        nameKey,
        emoji: parsed.data.emoji,
        isGuest: false,
        pinHash,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: created.id,
        entityType: "member",
        entityId: created.id,
        action: "join",
        after: {
          displayName: created.displayName,
          emoji: created.emoji,
        },
      },
    });

    return created;
  });

  await createMemberDeviceSession(member.id, trip.id);
  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function reclaimMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = reclaimMemberFormSchema.safeParse({
    slug,
    memberId: formData.get("memberId") ?? "",
    pin: formData.get("pin") ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  const member = await db.member.findUnique({
    where: { id: parsed.data.memberId },
  });

  if (!member || member.tripId !== trip.id || member.isGuest) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  if (member.pinHash) {
    if (!parsed.data.pin || !verifyPin(parsed.data.pin, member.pinHash)) {
      redirect(`/trips/${trip.slug}?error=wrong_pin`);
    }
  }

  await createMemberDeviceSession(member.id, trip.id);
  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function switchDeviceMemberAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const trip = await db.trip.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });

  if (trip) {
    await clearMemberDeviceSession(trip.id);
    revalidatePath(`/trips/${trip.slug}`);
    redirect(`/trips/${trip.slug}`);
  }

  redirect("/");
}

export async function addGuestMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = addGuestFormSchema.safeParse({
    slug,
    displayName: formData.get("displayName") ?? "",
    emoji: formData.get("emoji") ?? "👤",
  });

  if (!parsed.success) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const displayName = parsed.data.displayName.trim();
  const nameKey = normalizeNameKey(displayName);

  const existing = await db.member.findUnique({
    where: {
      tripId_nameKey: {
        tripId: trip.id,
        nameKey,
      },
    },
  });

  if (existing) {
    redirect(`/trips/${trip.slug}?error=duplicate_name`);
  }

  await db.$transaction(async (tx) => {
    const guest = await tx.member.create({
      data: {
        tripId: trip.id,
        displayName,
        nameKey,
        emoji: parsed.data.emoji,
        isGuest: true,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "member",
        entityId: guest.id,
        action: "create_guest",
        after: {
          displayName: guest.displayName,
          emoji: guest.emoji,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function renameMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = renameMemberFormSchema.safeParse({
    slug,
    memberId: formData.get("memberId") ?? "",
    displayName: formData.get("displayName") ?? "",
    emoji: formData.get("emoji") ?? "🎒",
  });

  if (!parsed.success) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const targetMember = await db.member.findUnique({
    where: { id: parsed.data.memberId },
  });

  if (!targetMember || targetMember.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  const displayName = parsed.data.displayName.trim();
  const nameKey = normalizeNameKey(displayName);

  const duplicate = await db.member.findUnique({
    where: {
      tripId_nameKey: {
        tripId: trip.id,
        nameKey,
      },
    },
  });

  if (duplicate && duplicate.id !== targetMember.id) {
    redirect(`/trips/${trip.slug}?error=duplicate_name`);
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: targetMember.id },
      data: {
        displayName,
        nameKey,
        emoji: parsed.data.emoji,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "member",
        entityId: targetMember.id,
        action: "update",
        before: {
          displayName: targetMember.displayName,
          emoji: targetMember.emoji,
        },
        after: {
          displayName: updated.displayName,
          emoji: updated.emoji,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function toggleTripLockAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const trip = await db.trip.findUnique({
    where: { slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const nextLockedAt = trip.lockedAt ? null : new Date();

  await db.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: trip.id },
      data: { lockedAt: nextLockedAt },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "trip",
        entityId: trip.id,
        action: nextLockedAt ? "lock" : "unlock",
        before: { lockedAt: trip.lockedAt?.toISOString() ?? null },
        after: { lockedAt: nextLockedAt?.toISOString() ?? null },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

// ---- Step 3 & Step 4: Money Core + Safety Layer Server Actions -----------

export async function saveExpenseAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = expenseFormSchema.safeParse({
    slug,
    expenseId: formData.get("expenseId") ?? undefined,
    title: formData.get("title") ?? "",
    amount: formData.get("amount") ?? "",
    category: formData.get("category") ?? "OTHER",
    expenseDate: formData.get("expenseDate") ?? "",
    paidById: formData.get("paidById") ?? "",
    splitType: formData.get("splitType") ?? "EQUAL",
    note: formData.get("note") ?? undefined,
  });

  if (!parsed.success) {
    const hasAmountErr = parsed.error.issues.some(
      (i) => i.message === "invalid_amount",
    );
    const code = hasAmountErr ? "invalid_amount" : "invalid_input";
    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: {
      members: true,
      expenses: {
        where: { deletedAt: null },
      },
    },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  // Step 4 Guard 1: Locked trips block every write route
  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const validMemberIds = new Set(trip.members.map((m) => m.id));
  const expenseDate = parseDhakaExpenseDate(parsed.data.expenseDate);

  // Step 4 Guard 4: Duplicate-entry warning check (unless user checked confirmDuplicate)
  const confirmDuplicate = formData.get("confirmDuplicate") === "true";
  if (!confirmDuplicate) {
    const duplicate = findDuplicateExpenseCandidate(
      {
        title: parsed.data.title,
        amount: parsed.data.amount,
        category: parsed.data.category,
        expenseDate,
        paidById: parsed.data.paidById,
        excludeExpenseId: parsed.data.expenseId,
      },
      trip.expenses.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        category: e.category as ExpenseCategoryValue,
        expenseDate: e.expenseDate,
        paidById: e.paidById,
        deletedAt: e.deletedAt,
      })),
    );

    if (duplicate) {
      redirect(`/trips/${trip.slug}?error=duplicate_expense_warning#expense-form`);
    }
  }

  let shares: ShareOutput[];
  try {
    if (parsed.data.splitType === "EQUAL") {
      const selectedIds = formData
        .getAll("participantIds")
        .map((v) => String(v).trim())
        .filter((id) => validMemberIds.has(id));
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "EQUAL",
        participantIds: selectedIds,
      });
    } else if (parsed.data.splitType === "EXACT") {
      const exactShares: ExactShareInput[] = [];
      for (const m of trip.members) {
        const rawVal = String(formData.get(`exact_${m.id}`) ?? "").trim();
        if (!rawVal) continue;
        const num = Number(banglaToAsciiDigits(rawVal.replace(/,/g, "")));
        if (num > 0) {
          exactShares.push({ memberId: m.id, amount: num });
        }
      }
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "EXACT",
        exactShares,
      });
    } else {
      const percentShares: PercentShareInput[] = [];
      for (const m of trip.members) {
        const rawVal = String(formData.get(`percent_${m.id}`) ?? "").trim();
        if (!rawVal) continue;
        const num = Number(banglaToAsciiDigits(rawVal.replace(/,/g, "")));
        if (num > 0) {
          percentShares.push({ memberId: m.id, percent: num });
        }
      }
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "PERCENT",
        percentShares,
      });
    }

    // Step 4 Guard 2: Verify share amounts add up to expense amount and belong to trip members
    assertValidExpenseSharesForTrip({
      expenseAmount: parsed.data.amount,
      paidById: parsed.data.paidById,
      shares,
      validTripMemberIds: validMemberIds,
    });
  } catch {
    redirect(`/trips/${trip.slug}?error=invalid_shares`);
  }

  if (parsed.data.expenseId) {
    // Update existing expense + write ActivityLog in the same transaction
    const existingExpense = await db.expense.findUnique({
      where: { id: parsed.data.expenseId },
      include: { shares: true },
    });

    if (
      !existingExpense ||
      existingExpense.tripId !== trip.id ||
      existingExpense.deletedAt
    ) {
      redirect(`/trips/${trip.slug}?error=invalid_input`);
    }

    await db.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({
        where: { expenseId: existingExpense.id },
      });

      const updated = await tx.expense.update({
        where: { id: existingExpense.id },
        data: {
          title: parsed.data.title,
          amount: parsed.data.amount,
          category: parsed.data.category,
          expenseDate,
          paidById: parsed.data.paidById,
          splitType: parsed.data.splitType,
          note: parsed.data.note ?? null,
          shares: {
            create: shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
        },
      });

      await tx.activityLog.create({
        data: {
          tripId: trip.id,
          memberId: currentMember.id,
          entityType: "expense",
          entityId: updated.id,
          action: "update",
          before: {
            title: existingExpense.title,
            amount: existingExpense.amount,
            category: existingExpense.category,
            paidById: existingExpense.paidById,
            splitType: existingExpense.splitType,
            shares: existingExpense.shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
          after: {
            title: updated.title,
            amount: updated.amount,
            category: updated.category,
            paidById: updated.paidById,
            splitType: updated.splitType,
            shares,
          },
        },
      });
    });
  } else {
    // Create new expense + write ActivityLog in the same transaction
    await db.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          tripId: trip.id,
          title: parsed.data.title,
          amount: parsed.data.amount,
          category: parsed.data.category,
          expenseDate,
          paidById: parsed.data.paidById,
          createdById: currentMember.id,
          splitType: parsed.data.splitType,
          note: parsed.data.note ?? null,
          shares: {
            create: shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
        },
      });

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
            shares,
          },
        },
      });
    });
  }

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const expenseId = String(formData.get("expenseId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const existing = await db.expense.findUnique({
    where: { id: expenseId },
  });

  if (!existing || existing.tripId !== trip.id || existing.deletedAt) {
    redirect(`/trips/${trip.slug}`);
  }

  // Soft delete only (deletedAt), never hard delete, with ActivityLog in the same transaction
  const deletedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: existing.id },
      data: { deletedAt },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "expense",
        entityId: existing.id,
        action: "delete",
        before: {
          title: existing.title,
          amount: existing.amount,
          paidById: existing.paidById,
        },
        after: {
          title: existing.title,
          amount: existing.amount,
          deletedAt: deletedAt.toISOString(),
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function createSettlementAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = settlementFormSchema.safeParse({
    slug,
    fromMemberId: formData.get("fromMemberId") ?? "",
    toMemberId: formData.get("toMemberId") ?? "",
    amount: formData.get("amount") ?? "",
  });

  if (!parsed.success) {
    const hasSameErr = parsed.error.issues.some(
      (i) => i.message === "same_member_settlement",
    );
    const hasAmountErr = parsed.error.issues.some(
      (i) => i.message === "invalid_amount",
    );
    const code = hasSameErr
      ? "same_member_settlement"
      : hasAmountErr
        ? "invalid_amount"
        : "invalid_input";
    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: { members: true },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const validMemberIds = new Set(trip.members.map((m) => m.id));
  if (
    !validMemberIds.has(parsed.data.fromMemberId) ||
    !validMemberIds.has(parsed.data.toMemberId)
  ) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  await db.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: {
        tripId: trip.id,
        fromMemberId: parsed.data.fromMemberId,
        toMemberId: parsed.data.toMemberId,
        amount: parsed.data.amount,
        createdById: currentMember.id,
      },
    });

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
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteSettlementAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const settlementId = String(formData.get("settlementId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const existing = await db.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!existing || existing.tripId !== trip.id || existing.deletedAt) {
    redirect(`/trips/${trip.slug}`);
  }

  // Soft delete only (deletedAt), never hard delete, with ActivityLog in the same transaction
  const deletedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.settlement.update({
      where: { id: existing.id },
      data: { deletedAt },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "settlement",
        entityId: existing.id,
        action: "delete",
        before: {
          fromMemberId: existing.fromMemberId,
          toMemberId: existing.toMemberId,
          amount: existing.amount,
        },
        after: {
          fromMemberId: existing.fromMemberId,
          toMemberId: existing.toMemberId,
          amount: existing.amount,
          deletedAt: deletedAt.toISOString(),
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

/**
 * Step 4 Guard 3 Server Action: Verifies vote option belongs to the exact same trip
 * and blocks locked trips before upserting a member's destination vote.
 */
export async function castDestinationVoteAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const optionId = String(formData.get("optionId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const option = await db.destinationOption.findUnique({
    where: { id: optionId },
    select: { id: true, tripId: true, name: true },
  });

  try {
    assertVoteOptionBelongsToTrip({
      tripId: trip.id,
      member: currentMember,
      option,
    });
  } catch (err) {
    if (err instanceof SafetyViolationError && err.code === "cross_trip_option") {
      redirect(`/trips/${trip.slug}?error=cross_trip_option`);
    }
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  await db.$transaction(async (tx) => {
    const vote = await tx.vote.upsert({
      where: {
        tripId_memberId: {
          tripId: trip.id,
          memberId: currentMember.id,
        },
      },
      update: { optionId: option!.id },
      create: {
        tripId: trip.id,
        memberId: currentMember.id,
        optionId: option!.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "vote",
        entityId: vote.id,
        action: "upsert",
        after: {
          name: option!.name,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}
EOF

cat > "${PROJECT_DIR}/src/app/trips/[slug]/page.tsx" <<'EOF'
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addGuestMemberAction,
  joinTripAction,
  reclaimMemberAction,
  renameMemberAction,
  switchDeviceMemberAction,
  toggleTripLockAction,
} from "@/app/trips/actions";
import { ActivityLogCard } from "@/components/ActivityLogCard";
import { BalancesCard } from "@/components/BalancesCard";
import { Button } from "@/components/Button";
import {
  type EditableExpenseData,
  type ExistingExpenseSummary,
  ExpenseFormCard,
} from "@/components/ExpenseFormCard";
import { PerDayExpensesView } from "@/components/PerDayExpensesView";
import { SettlementsCard } from "@/components/SettlementsCard";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { db } from "@/lib/db";
import {
  formatDate,
  type SupportedLocale,
  toBanglaDigits,
} from "@/lib/format";
import {
  computeMemberBalances,
  type ExpenseCategoryValue,
  type ExpenseRecordInput,
  groupExpensesByDhakaDay,
  type MemberInput,
  type SettlementRecordInput,
  simplifyDebts,
  type SplitTypeValue,
} from "@/lib/money";
import type {
  ActivityLogRecordInput,
  ActivityLogSnapshot,
} from "@/lib/safety";
import { getCurrentMemberForTrip } from "@/lib/session";
import { dayKey } from "@/lib/time";
import { MEMBER_EMOJIS } from "@/lib/trips";

interface TripPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; editExpense?: string }>;
}

type ErrorKey =
  | "invalid_input"
  | "invalid_pin"
  | "wrong_pin"
  | "duplicate_name"
  | "trip_not_found"
  | "trip_locked"
  | "not_creator"
  | "invalid_amount"
  | "invalid_shares"
  | "same_member_settlement"
  | "unauthorized"
  | "duplicate_expense_warning"
  | "cross_trip_option";

const ERROR_KEYS = new Set<ErrorKey>([
  "invalid_input",
  "invalid_pin",
  "wrong_pin",
  "duplicate_name",
  "trip_not_found",
  "trip_locked",
  "not_creator",
  "invalid_amount",
  "invalid_shares",
  "same_member_settlement",
  "unauthorized",
  "duplicate_expense_warning",
  "cross_trip_option",
]);

function asSnapshot(val: unknown): ActivityLogSnapshot | null {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as ActivityLogSnapshot;
  }
  return null;
}

export default async function TripPage({
  params,
  searchParams,
}: TripPageProps) {
  const { slug } = await params;
  const { error, editExpense } = await searchParams;
  const locale = (await getLocale()) as SupportedLocale;

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
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 60,
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  const tWho = await getTranslations("whoAreYou");
  const tTrip = await getTranslations("tripPage");
  const tMoney = await getTranslations("money");
  const tErr = await getTranslations("errors");

  const errorMessage =
    error && ERROR_KEYS.has(error as ErrorKey)
      ? tErr(error as ErrorKey)
      : null;

  const isLocked = Boolean(trip.lockedAt);
  const reclaimableMembers = trip.members.filter((m) => !m.isGuest);

  // 1. If device has no active session for this trip, show the "Who are you?" screen
  if (!currentMember) {
    return (
      <section className="space-y-6 py-2">
        <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">
              {trip.name}
            </h1>
            <span className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg-muted)]">
              {isLocked ? tTrip("lockedBadge") : tTrip("unlockedBadge")}
            </span>
          </div>
          {trip.destination ? (
            <p className="text-base text-[var(--color-fg-muted)]">
              {tTrip("destinationPrefix")} {trip.destination}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[var(--color-fg)]">
            {tWho("title")}
          </h2>
          <p className="text-base text-[var(--color-fg-muted)]">
            {tWho("subtitle")}
          </p>
        </div>

        {/* Reclaim existing member section */}
        {reclaimableMembers.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-base font-semibold text-[var(--color-fg)]">
              {tWho("reclaimTitle")}
            </h3>

            <div className="space-y-2.5">
              {reclaimableMembers.map((member) => {
                const hasPin = Boolean(member.pinHash);
                return (
                  <form
                    key={member.id}
                    action={reclaimMemberAction}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                  >
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="memberId" value={member.id} />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-[var(--color-fg)]">
                        <span className="text-xl">{member.emoji ?? "🎒"}</span>
                        <span>{member.displayName}</span>
                        {member.id === trip.creatorMemberId ? (
                          <span className="rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
                            {tTrip("creatorBadge")}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                        {hasPin ? `🔒 ${tWho("pinProtected")}` : tWho("noPinSet")}
                      </span>
                    </div>

                    {hasPin ? (
                      <div className="flex gap-2">
                        <input
                          name="pin"
                          type="password"
                          inputMode="numeric"
                          required
                          maxLength={6}
                          placeholder={tWho("enterPinPlaceholder")}
                          className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                        >
                          {tWho("reclaimButton")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                      >
                        {tWho("reclaimButton")}
                      </button>
                    )}
                  </form>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Join as a new member section */}
        <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-base font-semibold text-[var(--color-fg)]">
            {tWho("newMemberTitle")}
          </h3>

          {isLocked ? (
            <p className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-base text-[var(--color-fg-muted)]">
              {tWho("lockedNotice")}
            </p>
          ) : (
            <form action={joinTripAction} className="space-y-4">
              <input type="hidden" name="slug" value={trip.slug} />

              <div className="space-y-1.5">
                <label
                  htmlFor="displayName"
                  className="block text-base font-semibold text-[var(--color-fg)]"
                >
                  {tWho("yourNameLabel")}
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  minLength={1}
                  maxLength={40}
                  placeholder={tWho("yourNamePlaceholder")}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-base font-semibold text-[var(--color-fg)]">
                  {tWho("emojiLabel")}
                </legend>
                <div className="grid grid-cols-6 gap-2 pt-1">
                  {MEMBER_EMOJIS.map((emoji, index) => (
                    <label
                      key={emoji}
                      className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl has-[:checked]:border-2 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-white"
                    >
                      <input
                        type="radio"
                        name="emoji"
                        value={emoji}
                        defaultChecked={index === 0}
                        className="sr-only"
                      />
                      <span>{emoji}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <label
                  htmlFor="pin"
                  className="block text-base font-semibold text-[var(--color-fg)]"
                >
                  {tWho("pinLabel")}
                </label>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={tWho("pinPlaceholder")}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <Button type="submit" variant="primary">
                {tWho("joinButton")}
              </Button>
            </form>
          )}
        </div>
      </section>
    );
  }

  // 2. Signed-in Trip Hub View + Step 3 Money Core + Step 4 Safety Layer
  const isCreator = currentMember.id === trip.creatorMemberId;
  const memberCountLabel =
    locale === "bn"
      ? toBanglaDigits(trip.members.length)
      : String(trip.members.length);

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

  const existingExpenseSummaries: ExistingExpenseSummary[] = expenseInputs.map(
    (e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      expenseDateYyyyMmDd: dayKey(e.expenseDate),
      paidById: e.paidById,
    }),
  );

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

  const activityLogInputs: ActivityLogRecordInput[] = trip.activityLogs.map(
    (log) => ({
      id: log.id,
      tripId: log.tripId,
      memberId: log.memberId,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      before: asSnapshot(log.before),
      after: asSnapshot(log.after),
      createdAt: log.createdAt,
    }),
  );

  const totalTripSpend = expenseInputs.reduce((sum, e) => sum + e.amount, 0);
  const balances = computeMemberBalances({
    members: memberInputs,
    expenses: expenseInputs,
    settlements: settlementInputs,
  });
  const simplifiedDebts = simplifyDebts(balances);

  const dayGroups = groupExpensesByDhakaDay({
    expenses: expenseInputs,
    members: memberInputs,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    locale,
    otherDatesLabel: tMoney("otherDatesLabel"),
  });

  const targetEditExpense = editExpense
    ? expenseInputs.find((e) => e.id === editExpense)
    : undefined;

  const editingExpenseData: EditableExpenseData | null = targetEditExpense
    ? {
        id: targetEditExpense.id,
        title: targetEditExpense.title,
        amount: targetEditExpense.amount,
        category: targetEditExpense.category,
        expenseDateYyyyMmDd: dayKey(targetEditExpense.expenseDate),
        paidById: targetEditExpense.paidById,
        splitType: targetEditExpense.splitType,
        note: targetEditExpense.note ?? null,
        shares: targetEditExpense.shares,
      }
    : null;

  const categoryLabels: Record<ExpenseCategoryValue, string> = {
    TRANSPORT: tMoney("cat_TRANSPORT"),
    HOTEL: tMoney("cat_HOTEL"),
    FOOD: tMoney("cat_FOOD"),
    TICKET: tMoney("cat_TICKET"),
    OTHER: tMoney("cat_OTHER"),
  };

  const defaultExpenseDate = dayKey(trip.startDate ?? new Date());

  return (
    <section className="space-y-5 py-2">
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Trip header card */}
      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">
              {trip.name}
            </h1>
            {trip.destination ? (
              <p className="text-base text-[var(--color-fg-muted)]">
                {tTrip("destinationPrefix")} {trip.destination}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg-muted)]">
            {isLocked ? tTrip("lockedBadge") : tTrip("unlockedBadge")}
          </span>
        </div>

        {trip.startDate || trip.endDate ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            {trip.startDate ? formatDate(trip.startDate, locale) : ""}{" "}
            {trip.startDate && trip.endDate ? "—" : ""}{" "}
            {trip.endDate ? formatDate(trip.endDate, locale) : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center gap-2 text-base">
            <span className="text-[var(--color-fg-muted)]">
              {tTrip("signedInAs")}
            </span>
            <span className="font-bold text-[var(--color-fg)]">
              {currentMember.emoji ?? "🎒"} {currentMember.displayName}
            </span>
          </div>

          <form action={switchDeviceMemberAction}>
            <input type="hidden" name="slug" value={trip.slug} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-border)]"
            >
              {tTrip("switchDevice")}
            </button>
          </form>
        </div>
      </div>

      {/* Step 3.1 + Step 4: Manual Expense Form with Live Duplicate-Entry Warning */}
      {!isLocked ? (
        <div id="expense-form">
          <ExpenseFormCard
            key={editingExpenseData?.id ?? "new-expense"}
            slug={trip.slug}
            members={memberInputs}
            currentMemberId={currentMember.id}
            defaultDateYyyyMmDd={defaultExpenseDate}
            editingExpense={editingExpenseData}
            existingExpenses={existingExpenseSummaries}
            forceShowDuplicateConfirm={error === "duplicate_expense_warning"}
            labels={{
              addExpenseTitle: tMoney("addExpenseTitle"),
              editExpenseTitle: tMoney("editExpenseTitle"),
              cancelEdit: tMoney("cancelEdit"),
              titleLabel: tMoney("titleLabel"),
              titlePlaceholder: tMoney("titlePlaceholder"),
              amountLabel: tMoney("amountLabel"),
              amountPlaceholder: tMoney("amountPlaceholder"),
              categoryLabel: tMoney("categoryLabel"),
              dateLabel: tMoney("dateLabel"),
              paidByLabel: tMoney("paidByLabel"),
              splitTypeLabel: tMoney("splitTypeLabel"),
              splitEqual: tMoney("splitEqual"),
              splitExact: tMoney("splitExact"),
              splitPercent: tMoney("splitPercent"),
              participantsLabel: tMoney("participantsLabel"),
              selectAll: tMoney("selectAll"),
              leftoverNote: tMoney("leftoverNote"),
              exactSumStatus: tMoney("exactSumStatus"),
              percentSumStatus: tMoney("percentSumStatus"),
              noteLabel: tMoney("noteLabel"),
              notePlaceholder: tMoney("notePlaceholder"),
              saveExpenseButton: tMoney("saveExpenseButton"),
              updateExpenseButton: tMoney("updateExpenseButton"),
              duplicateWarningTitle: tMoney("duplicateWarningTitle"),
              duplicateWarningBody: tMoney("duplicateWarningBody"),
              confirmDuplicateLabel: tMoney("confirmDuplicateLabel"),
              categories: categoryLabels,
            }}
          />
        </div>
      ) : null}

      {/* Step 3.2: Balances Computed on Read & Simplified Debts */}
      <BalancesCard
        locale={locale}
        totalTripSpend={totalTripSpend}
        balances={balances}
        simplifiedDebts={simplifiedDebts}
        labels={{
          balancesTitle: tMoney("balancesTitle"),
          totalTripSpend: tMoney("totalTripSpend"),
          whoOwesWhomTitle: tMoney("whoOwesWhomTitle"),
          allSettled: tMoney("allSettled"),
          owesArrow: tMoney("owesArrow"),
          memberBalancesSub: tMoney("memberBalancesSub"),
          colMember: tMoney("colMember"),
          colPaid: tMoney("colPaid"),
          colOwed: tMoney("colOwed"),
          colNet: tMoney("colNet"),
          statusGets: tMoney("statusGets"),
          statusOwes: tMoney("statusOwes"),
          statusEven: tMoney("statusEven"),
        }}
      />

      {/* Step 3.3 + Step 4: Per-Day View with Edit History & Post-Settlement Flagging */}
      <PerDayExpensesView
        slug={trip.slug}
        locale={locale}
        isLocked={isLocked}
        members={memberInputs}
        dayGroups={dayGroups}
        settlements={settlementInputs}
        activityLogs={activityLogInputs}
        labels={{
          perDayTitle: tMoney("perDayTitle"),
          noExpensesYet: tMoney("noExpensesYet"),
          dayTotalLabel: tMoney("dayTotalLabel"),
          perPersonDayCostLabel: tMoney("perPersonDayCostLabel"),
          paidByPrefix: tMoney("paidByPrefix"),
          editedAfterSettlementBadge: tMoney("editedAfterSettlementBadge"),
          editHistoryToggle: tMoney("editHistoryToggle"),
          editedByPrefix: tMoney("editedByPrefix"),
          editButton: tMoney("editButton"),
          deleteButton: tMoney("deleteButton"),
          categories: categoryLabels,
        }}
      />

      {/* Step 3.4: Settlements (Repayments, separate from expenses) */}
      <SettlementsCard
        slug={trip.slug}
        locale={locale}
        isLocked={isLocked}
        currentMemberId={currentMember.id}
        members={memberInputs}
        settlements={settlementInputs}
        labels={{
          settlementsTitle: tMoney("settlementsTitle"),
          settlementSubtitle: tMoney("settlementSubtitle"),
          fromMemberLabel: tMoney("fromMemberLabel"),
          toMemberLabel: tMoney("toMemberLabel"),
          settlementAmountLabel: tMoney("settlementAmountLabel"),
          recordSettlementButton: tMoney("recordSettlementButton"),
          recordedSettlementsList: tMoney("recordedSettlementsList"),
          paidBackText: tMoney("paidBackText"),
          toText: tMoney("toText"),
          deleteButton: tMoney("deleteButton"),
        }}
      />

      {/* Step 4: Activity Log & Dispute-Protection Audit Trail */}
      <ActivityLogCard
        locale={locale}
        members={memberInputs}
        activityLogs={activityLogInputs}
        labels={{
          activityLogTitle: tMoney("activityLogTitle"),
          activityLogSubtitle: tMoney("activityLogSubtitle"),
          noActivityYet: tMoney("noActivityYet"),
          act_expense_create: tMoney("act_expense_create"),
          act_expense_update: tMoney("act_expense_update"),
          act_expense_delete: tMoney("act_expense_delete"),
          act_settlement_create: tMoney("act_settlement_create"),
          act_settlement_delete: tMoney("act_settlement_delete"),
          act_member_join: tMoney("act_member_join"),
          act_member_create_guest: tMoney("act_member_create_guest"),
          act_member_update: tMoney("act_member_update"),
          act_trip_create: tMoney("act_trip_create"),
          act_trip_lock: tMoney("act_trip_lock"),
          act_trip_unlock: tMoney("act_trip_unlock"),
        }}
      />

      {/* Shareable invite link card */}
      <ShareLinkCard
        slug={trip.slug}
        tripName={trip.name}
        shareTitle={tTrip("shareTitle")}
        shareSubtitle={tTrip("shareSubtitle")}
        copyLabel={tTrip("copyLink")}
        copiedLabel={tTrip("copied")}
        shareNativeLabel={tTrip("shareNative")}
      />

      {/* Members list */}
      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-fg)]">
            {tTrip("membersHeading")} ({memberCountLabel})
          </h2>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {trip.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{member.emoji ?? "🎒"}</span>
                <span className="font-semibold text-[var(--color-fg)]">
                  {member.displayName}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {member.id === trip.creatorMemberId ? (
                  <span className="rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
                    {tTrip("creatorBadge")}
                  </span>
                ) : null}
                {member.isGuest ? (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {tTrip("guestBadge")}
                  </span>
                ) : null}
                {member.pinHash ? (
                  <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]">
                    🔒 {tTrip("pinSetBadge")}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Creator Controls (visible only to trip creator) */}
      {isCreator ? (
        <div className="space-y-5 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-4">
          <h2 className="text-lg font-bold text-[var(--color-primary)]">
            {tTrip("creatorControlsTitle")}
          </h2>

          {/* Add Guest Form */}
          {!isLocked ? (
            <form action={addGuestMemberAction} className="space-y-2.5">
              <input type="hidden" name="slug" value={trip.slug} />
              <label
                htmlFor="guestDisplayName"
                className="block text-sm font-semibold text-[var(--color-fg)]"
              >
                {tTrip("addGuestTitle")}
              </label>
              <div className="flex gap-2">
                <select
                  name="emoji"
                  aria-label="Guest emoji"
                  defaultValue="👤"
                  className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-white px-2 text-lg"
                >
                  <option value="👤">👤</option>
                  {MEMBER_EMOJIS.map((emoji) => (
                    <option key={emoji} value={emoji}>
                      {emoji}
                    </option>
                  ))}
                </select>
                <input
                  id="guestDisplayName"
                  name="displayName"
                  type="text"
                  required
                  maxLength={40}
                  placeholder={tTrip("guestNamePlaceholder")}
                  className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                >
                  {tTrip("addGuestButton")}
                </button>
              </div>
            </form>
          ) : null}

          {/* Rename / Update Emoji per Member */}
          {!isLocked ? (
            <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                {tTrip("renameTitle")}
              </h3>
              <div className="space-y-2">
                {trip.members.map((member) => (
                  <form
                    key={member.id}
                    action={renameMemberAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <select
                      name="emoji"
                      aria-label={`Emoji for ${member.displayName}`}
                      defaultValue={member.emoji ?? "🎒"}
                      className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-white px-2 text-lg"
                    >
                      <option value="👤">👤</option>
                      {MEMBER_EMOJIS.map((emoji) => (
                        <option key={emoji} value={emoji}>
                          {emoji}
                        </option>
                      ))}
                    </select>
                    <input
                      name="displayName"
                      type="text"
                      required
                      maxLength={40}
                      defaultValue={member.displayName}
                      className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-border)]"
                    >
                      {tTrip("renameSaveButton")}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}

          {/* Lock / Unlock Trip Toggle */}
          <form
            action={toggleTripLockAction}
            className="space-y-2 border-t border-[var(--color-border)] pt-4"
          >
            <input type="hidden" name="slug" value={trip.slug} />
            <p className="text-sm text-[var(--color-fg-muted)]">
              {tTrip("lockTripHint")}
            </p>
            <Button
              type="submit"
              variant={isLocked ? "primary" : "secondary"}
            >
              {isLocked ? tTrip("unlockTripButton") : tTrip("lockTripButton")}
            </Button>
          </form>
        </div>
      ) : null}

      {/* Placeholder for Step 5 features */}
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
        <h3 className="text-base font-semibold text-[var(--color-fg)]">
          {tTrip("nextStepsTitle")}
        </h3>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {tTrip("nextStepsBody")}
        </p>
      </div>
    </section>
  );
}
EOF

cat > "${PROJECT_DIR}/docs/STEP4-VERIFY.md" <<'EOF'
# Step 4 — Manual Acceptance Verification Checklist (Safety Layer)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Duplicate-Entry Warning (Live Banner & Server Guard)
- [ ] In the **Add an Expense** form, type the exact same Title (`Seafood Dinner`), Amount (`2000`), Category (`Food`), and Date (`2026-10-17`) as an existing active expense on the trip.
- [ ] Verify the amber **⚠️ সম্ভাব্য ডুপ্লিকেট খরচ! (`⚠️ Possible Duplicate Expense!`)** banner appears immediately in the form, showing the matching existing expense (`"Seafood Dinner" (৳2000)`) and requiring the **আমি নিশ্চিত, এটি আলাদা খরচ (`I confirm this is a separate expense`)** checkbox before saving.
- [ ] Check the confirmation checkbox and submit. Verify the expense saves cleanly when confirmed.

## 2. Edit History & Flagging Edits Made After a Settlement
- [ ] Ensure at least one settlement is recorded on the trip (e.g., `Tanvir` paid back `Sumi` `৳1,000`).
- [ ] Click **এডিট (`Edit`)** on an existing expense (e.g., change `Resort Check-in` from `5000` to `5500` and title to `Resort Check-in + Extra Bed`) and save.
- [ ] On the updated expense card in the Per-Day view:
  - [ ] Verify the amber **⚠️ লেনদেন নিষ্পত্তির পরে এডিট করা হয়েছে (`⚠️ Edited after a settlement`)** badge is displayed.
  - [ ] Click **এডিট হিস্ট্রি দেখুন (`View edit history (1)`)** and verify it expands to show who edited the expense, the date, the title diff (`"Resort Check-in" → "Resort Check-in + Extra Bed"`), and the amount diff (`৳৫,০০০ → ৳৫,৫০০` / `৳5,000 → ৳5,500`).

## 3. Soft Delete Everywhere & Immutable Activity Log
- [ ] Click **মুছুন (`Delete`)** on the duplicate expense you created in Step 1.
- [ ] Verify it disappears from the active Per-Day view and balances, **and** scroll down to **অ্যাক্টিভিটি লগ ও পরিবর্তন ইতিহাস (`Activity Log & Audit Trail`)** to confirm a red audit entry (`খরচ মুছে ফেলেছেন (Soft-deleted): "Seafood Dinner" (৳২,০০০)`) is permanently recorded.
- [ ] Open `pnpm db:studio` (or inspect Postgres) and confirm the `Expense` row still exists in the database with a non-null `deletedAt` timestamp (never hard-deleted).

## 4. Locked Trips Block Every Write Route
- [ ] As the trip creator, click **ট্রিপ লক করুন (`Lock trip`)**.
- [ ] Verify the Add Expense form, Edit/Delete expense buttons, Record/Delete settlement forms, Add Guest form, and Rename Member forms are all hidden, and any direct POST to a write action redirects with the `trip_locked` error.
- [ ] Click **ট্রিপ আনলক করুন (`Unlock trip`)** to restore write access.

## 5. Automated Unit Tests for Share-Sum & Cross-Trip Vote Guards
- [ ] Run `pnpm test` and confirm `src/lib/__tests__/step4-safety.test.ts` passes all unit tests for `assertTripWritable`, `assertValidExpenseSharesForTrip`, `assertVoteOptionBelongsToTrip`, `findDuplicateExpenseCandidate`, and `extractExpenseEditHistory`.
EOF

