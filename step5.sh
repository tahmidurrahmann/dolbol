<USER_REQUEST>
#!/usr/bin/env bash
set -euo pipefail

if [ -f "./package.json" ] && [ -d "./src" ]; then
  PROJECT_DIR="."
elif [ -d "./trip-hub" ]; then
  PROJECT_DIR="./trip-hub"
else
  echo "ERROR: Run step5.sh either inside trip-hub/ or from its parent directory." >&2
  exit 1
fi

echo "==> Applying Step 5 (Destination Voting & Day-by-Day Itinerary) to ${PROJECT_DIR} ..."
mkdir -p \
  "${PROJECT_DIR}/docs" \
  "${PROJECT_DIR}/src/lib/__tests__" \
  "${PROJECT_DIR}/src/components" \
  "${PROJECT_DIR}/src/messages" \
  "${PROJECT_DIR}/src/app/trips/[slug]"

cat > "${PROJECT_DIR}/src/lib/planning.ts" <<'EOF'
import { normalizeNameKey } from "@/lib/crypto";
import { formatDate, type SupportedLocale, toBanglaDigits } from "@/lib/format";
import type { MemberInput } from "@/lib/money";
import { dayKey } from "@/lib/time";

export interface DestinationOptionRecordInput {
  id: string;
  tripId: string;
  name: string;
  proposedById: string | null;
  createdAt: Date;
}

export interface VoteRecordInput {
  id: string;
  tripId: string;
  memberId: string;
  optionId: string;
}

export interface VoterBadge {
  memberId: string;
  displayName: string;
  emoji: string;
}

export interface DestinationOptionSummary {
  optionId: string;
  name: string;
  proposedByDisplayName: string | null;
  voteCount: number;
  votePercent: number;
  voters: VoterBadge[];
  isCurrentMemberVote: boolean;
  isLeading: boolean;
}

/**
 * Checks if a proposed destination option name already exists on the trip
 * (case-insensitive, whitespace-normalized).
 */
export function hasDuplicateDestinationOption(
  candidateName: string,
  existingOptions: ReadonlyArray<Pick<DestinationOptionRecordInput, "name">>,
): boolean {
  const target = normalizeNameKey(candidateName);
  if (!target) {
    return false;
  }
  return existingOptions.some((opt) => normalizeNameKey(opt.name) === target);
}

/**
 * Aggregates destination options and votes for a trip.
 * Enforces at most one vote per non-guest member of the trip and sorts options
 * by highest vote count first (tie-broken by createdAt ascending).
 */
export function summarizeDestinationVotes(args: {
  options: ReadonlyArray<DestinationOptionRecordInput>;
  votes: ReadonlyArray<VoteRecordInput>;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): {
  totalVotes: number;
  currentMemberOptionId: string | null;
  options: DestinationOptionSummary[];
} {
  const memberById = new Map(args.members.map((m) => [m.id, m]));
  const validOptionIds = new Set(args.options.map((o) => o.id));

  // Enforce one vote per non-guest member (last write wins if array has duplicates)
  const voteByMemberId = new Map<string, string>();
  for (const v of args.votes) {
    const member = memberById.get(v.memberId);
    if (!member || member.isGuest) {
      continue;
    }
    if (!validOptionIds.has(v.optionId)) {
      continue;
    }
    voteByMemberId.set(v.memberId, v.optionId);
  }

  const votersByOptionId = new Map<string, VoterBadge[]>();
  for (const opt of args.options) {
    votersByOptionId.set(opt.id, []);
  }

  for (const [memberId, optionId] of voteByMemberId.entries()) {
    const member = memberById.get(memberId);
    if (!member) continue;
    const list = votersByOptionId.get(optionId);
    if (list) {
      list.push({
        memberId: member.id,
        displayName: member.displayName,
        emoji: member.emoji ?? "🎒",
      });
    }
  }

  const totalVotes = voteByMemberId.size;
  const currentMemberOptionId =
    voteByMemberId.get(args.currentMemberId) ?? null;

  let maxVoteCount = 0;
  for (const list of votersByOptionId.values()) {
    if (list.length > maxVoteCount) {
      maxVoteCount = list.length;
    }
  }

  const sortedOptions = [...args.options].sort((a, b) => {
    const countA = votersByOptionId.get(a.id)?.length ?? 0;
    const countB = votersByOptionId.get(b.id)?.length ?? 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const summaries: DestinationOptionSummary[] = sortedOptions.map((opt) => {
    const voters = votersByOptionId.get(opt.id) ?? [];
    const voteCount = voters.length;
    const votePercent =
      totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    const proposer = opt.proposedById
      ? memberById.get(opt.proposedById)
      : undefined;

    return {
      optionId: opt.id,
      name: opt.name,
      proposedByDisplayName: proposer ? proposer.displayName : null,
      voteCount,
      votePercent,
      voters,
      isCurrentMemberVote: currentMemberOptionId === opt.id,
      isLeading: maxVoteCount > 0 && voteCount === maxVoteCount,
    };
  });

  return {
    totalVotes,
    currentMemberOptionId,
    options: summaries,
  };
}

export interface ItineraryItemRecordInput {
  id: string;
  tripId: string;
  dayNumber: number;
  time: string | null;
  title: string;
  notes: string | null;
  position: number;
  createdById: string | null;
  createdAt: Date;
}

export interface ItineraryDayGroup {
  dayNumber: number;
  label: string;
  items: ItineraryItemRecordInput[];
}

function addDaysToYyyyMmDd(startYyyyMmDd: string, daysToAdd: number): Date {
  const baseMs = Date.parse(`${startYyyyMmDd}T12:00:00+06:00`);
  return new Date(baseMs + daysToAdd * 24 * 60 * 60 * 1000);
}

/**
 * Groups itinerary items by dayNumber (1, 2, ...), ordering items within each day
 * by position ascending, then createdAt ascending.
 * When tripStartDate is present, attaches the formatted Asia/Dhaka date to each day label.
 */
export function groupItineraryByDay(args: {
  items: ReadonlyArray<ItineraryItemRecordInput>;
  tripStartDate?: Date | null;
  locale: SupportedLocale;
}): ItineraryDayGroup[] {
  if (args.items.length === 0) {
    return [];
  }

  const startKey = args.tripStartDate ? dayKey(args.tripStartDate) : null;
  const byDay = new Map<number, ItineraryItemRecordInput[]>();

  for (const item of args.items) {
    const bucket = byDay.get(item.dayNumber) ?? [];
    bucket.push(item);
    byDay.set(item.dayNumber, bucket);
  }

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

  return sortedDays.map((dayNumber) => {
    const bucket = [...(byDay.get(dayNumber) ?? [])].sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    let label: string;
    if (startKey) {
      const dateForDay = addDaysToYyyyMmDd(startKey, dayNumber - 1);
      const formattedDate = formatDate(dateForDay, args.locale);
      label =
        args.locale === "bn"
          ? `দিন ${toBanglaDigits(dayNumber)} · ${formattedDate}`
          : `Day ${dayNumber} · ${formattedDate}`;
    } else {
      label =
        args.locale === "bn"
          ? `দিন ${toBanglaDigits(dayNumber)}`
          : `Day ${dayNumber}`;
    }

    return {
      dayNumber,
      label,
      items: bucket,
    };
  });
}
EOF

cat > "${PROJECT_DIR}/src/lib/trips.ts" <<'EOF'
import { z } from "zod";
import { banglaToAsciiDigits } from "@/lib/crypto";

export const MEMBER_EMOJIS = [
  "🎒",
  "🌴",
  "🚤",
  "🏔️",
  "📸",
  "🍵",
  "🎸",
  "🕶️",
  "🐅",
  "🌊",
  "⛺",
  "🚲",
] as const;

export type MemberEmoji = (typeof MEMBER_EMOJIS)[number];

export const EXPENSE_CATEGORIES = [
  "TRANSPORT",
  "HOTEL",
  "FOOD",
  "TICKET",
  "OTHER",
] as const;

export const SPLIT_TYPES = ["EQUAL", "EXACT", "PERCENT"] as const;

const optionalDateString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined))
  .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: "invalid_date",
  });

const optionalPinString = z
  .string()
  .trim()
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const ascii = banglaToAsciiDigits(val.trim());
    return ascii.length > 0 ? ascii : undefined;
  })
  .refine((val) => !val || /^\d{4,6}$/.test(val), {
    message: "invalid_pin",
  });

const optionalEmojiString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : "🎒"));

export const positiveTakaString = z
  .string()
  .trim()
  .transform((val) => Number(banglaToAsciiDigits(val.replace(/,/g, "").trim())))
  .refine((n) => Number.isInteger(n) && n > 0 && n <= 10_000_000, {
    message: "invalid_amount",
  });

export const dayNumberString = z
  .string()
  .trim()
  .transform((val) => Number(banglaToAsciiDigits(val.trim())))
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 60, {
    message: "invalid_day_number",
  });

export const createTripFormSchema = z.object({
  name: z.string().trim().min(2, "trip_name_short").max(80, "trip_name_long"),
  destination: z
    .string()
    .trim()
    .max(80, "destination_long")
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  startDate: optionalDateString,
  endDate: optionalDateString,
  creatorName: z
    .string()
    .trim()
    .min(1, "member_name_required")
    .max(40, "member_name_long"),
  creatorEmoji: optionalEmojiString,
  creatorPin: optionalPinString,
});

export const joinTripFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  displayName: z
    .string()
    .trim()
    .min(1, "member_name_required")
    .max(40, "member_name_long"),
  emoji: optionalEmojiString,
  pin: optionalPinString,
});

export const reclaimMemberFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  memberId: z.string().uuid(),
  pin: optionalPinString,
});

export const renameMemberFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  memberId: z.string().uuid(),
  displayName: z
    .string()
    .trim()
    .min(1, "member_name_required")
    .max(40, "member_name_long"),
  emoji: optionalEmojiString,
});

export const addGuestFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  displayName: z
    .string()
    .trim()
    .min(1, "member_name_required")
    .max(40, "member_name_long"),
  emoji: optionalEmojiString,
});

export const expenseFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  expenseId: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  title: z.string().trim().min(1, "title_required").max(100, "title_long"),
  amount: positiveTakaString,
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  expenseDate: z
    .string()
    .trim()
    .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "invalid_date",
    }),
  paidById: z.string().uuid("invalid_payer"),
  splitType: z.enum(SPLIT_TYPES).default("EQUAL"),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
});

export const settlementFormSchema = z
  .object({
    slug: z.string().trim().min(8).max(64),
    fromMemberId: z.string().uuid(),
    toMemberId: z.string().uuid(),
    amount: positiveTakaString,
  })
  .refine((data) => data.fromMemberId !== data.toMemberId, {
    message: "same_member_settlement",
  });

export const destinationOptionFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  name: z.string().trim().min(1, "option_name_required").max(80, "option_name_long"),
});

export const itineraryItemFormSchema = z.object({
  slug: z.string().trim().min(8).max(64),
  dayNumber: dayNumberString,
  time: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  title: z.string().trim().min(1, "title_required").max(120, "title_long"),
  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
});
EOF

cat > "${PROJECT_DIR}/src/lib/__tests__/step5-planning.test.ts" <<'EOF'
import { describe, expect, it } from "vitest";
import {
  groupItineraryByDay,
  hasDuplicateDestinationOption,
  summarizeDestinationVotes,
} from "@/lib/planning";

const MEMBERS = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
  { id: "mamun_guest", displayName: "Mamun", emoji: "👤", isGuest: true },
];

describe("destination options & one-vote-per-member aggregation", () => {
  it("detects duplicate destination option names case-insensitively", () => {
    const existing = [{ name: "কক্সবাজার" }, { name: "Cox's Bazar" }];
    expect(hasDuplicateDestinationOption("  কক্সবাজার  ", existing)).toBe(true);
    expect(hasDuplicateDestinationOption("cox's   bazar", existing)).toBe(true);
    expect(hasDuplicateDestinationOption("শ্রীমঙ্গল", existing)).toBe(false);
  });

  it("aggregates one vote per non-guest member, ranks options, and marks leading & current vote", () => {
    const options = [
      {
        id: "opt-sajek",
        tripId: "trip-1",
        name: "সাজেক ভ্যালি",
        proposedById: "karim",
        createdAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "opt-sundarban",
        tripId: "trip-1",
        name: "সুন্দরবন",
        proposedById: "sumi",
        createdAt: new Date("2026-10-15T11:00:00Z"),
      },
    ];

    const votes = [
      { id: "v1", tripId: "trip-1", memberId: "karim", optionId: "opt-sundarban" },
      { id: "v2", tripId: "trip-1", memberId: "sumi", optionId: "opt-sundarban" },
      { id: "v3", tripId: "trip-1", memberId: "tanvir", optionId: "opt-sajek" },
      // Guest vote should be ignored even if passed in
      { id: "v4", tripId: "trip-1", memberId: "mamun_guest", optionId: "opt-sajek" },
    ];

    const summary = summarizeDestinationVotes({
      options,
      votes,
      members: MEMBERS,
      currentMemberId: "karim",
    });

    expect(summary.totalVotes).toBe(3);
    expect(summary.currentMemberOptionId).toBe("opt-sundarban");

    // Sundarban has 2 votes (67%), Sajek has 1 vote (33%)
    expect(summary.options[0]?.optionId).toBe("opt-sundarban");
    expect(summary.options[0]?.voteCount).toBe(2);
    expect(summary.options[0]?.votePercent).toBe(67);
    expect(summary.options[0]?.isLeading).toBe(true);
    expect(summary.options[0]?.isCurrentMemberVote).toBe(true);

    expect(summary.options[1]?.optionId).toBe("opt-sajek");
    expect(summary.options[1]?.voteCount).toBe(1);
    expect(summary.options[1]?.votePercent).toBe(33);
    expect(summary.options[1]?.isLeading).toBe(false);
    expect(summary.options[1]?.isCurrentMemberVote).toBe(false);
  });
});

describe("groupItineraryByDay — day-by-day itinerary ordering & labels", () => {
  it("groups items by dayNumber, sorts by position, and formats Asia/Dhaka day labels", () => {
    const items = [
      {
        id: "it-2",
        tripId: "trip-1",
        dayNumber: 1,
        time: "14:00",
        title: "হোটেলে চেক-ইন ও দুপুরের খাবার",
        notes: null,
        position: 2,
        createdById: "karim",
        createdAt: new Date("2026-10-15T10:05:00Z"),
      },
      {
        id: "it-1",
        tripId: "trip-1",
        dayNumber: 1,
        time: "08:30",
        title: "খুলনা থেকে লঞ্চে যাত্রা",
        notes: "সকাল ৮টার মধ্যে ঘাটে থাকতে হবে",
        position: 1,
        createdById: "karim",
        createdAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "it-3",
        tripId: "trip-1",
        dayNumber: 2,
        time: "06:30",
        title: "কটকা অভয়ারণ্য ভ্রমণ",
        notes: null,
        position: 1,
        createdById: "sumi",
        createdAt: new Date("2026-10-15T10:10:00Z"),
      },
    ];

    const groupsBn = groupItineraryByDay({
      items,
      tripStartDate: new Date("2026-10-16T00:00:00+06:00"),
      locale: "bn",
    });

    expect(groupsBn).toHaveLength(2);
    expect(groupsBn[0]?.dayNumber).toBe(1);
    expect(groupsBn[0]?.label).toContain("দিন ১ ·");
    expect(groupsBn[0]?.items.map((i) => i.id)).toEqual(["it-1", "it-2"]);

    expect(groupsBn[1]?.dayNumber).toBe(2);
    expect(groupsBn[1]?.label).toContain("দিন ২ ·");
    expect(groupsBn[1]?.items.map((i) => i.id)).toEqual(["it-3"]);
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
    "nextStepsTitle": "এআই মেসেজ পার্সার ও শেয়ার কার্ড (ধাপ ৬-৭)",
    "nextStepsBody": "ধাপ ৬-৭ এ বাংলা/বাংলিশ টেক্সট থেকে অটো খরচ এন্ট্রি ও ডাউনলোডযোগ্য খরচের শিট যুক্ত হবে।"
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
  "planning": {
    "votingTitle": "গন্তব্য নির্বাচন ও ভোট (Destination Voting)",
    "votingSubtitle": "কোথায় ঘুরতে যাবেন? অপশন যোগ করুন ও ভোট দিন (জনপ্রতি ১টি ভোট)",
    "noOptionsYet": "এখনো কোনো গন্তব্য প্রস্তাব করা হয়নি।",
    "optionPlaceholder": "যেমন: সাজেক ভ্যালি / সেন্টমার্টিন",
    "addOptionButton": "অপশন যোগ করুন",
    "voteButton": "ভোট দিন",
    "votedBadge": "✓ আপনার ভোট",
    "topPickBadge": "🏆 শীর্ষ পছন্দ",
    "proposedByPrefix": "প্রস্তাব করেছেন:",
    "votesCountSuffix": "ভোট",
    "setAsDestinationButton": "ট্রিপের চূড়ান্ত গন্তব্য করুন",
    "itineraryTitle": "প্রতিদিনের ভ্রমণ সূচি (Day-by-Day Itinerary)",
    "itinerarySubtitle": "কোন দিন কখন কী করবেন তার সহজ তালিকা",
    "noItineraryYet": "এখনো কোনো ভ্রমণ সূচি যোগ করা হয়নি।",
    "dayNumberLabel": "দিন (Day) *",
    "timeLabel": "সময় (ঐচ্ছিক)",
    "timePlaceholder": "যেমন: ০৯:৩০",
    "activityTitleLabel": "কী প্ল্যান? *",
    "activityTitlePlaceholder": "যেমন: নীলগিরি ভ্রমণ ও দুপুরের খাবার",
    "activityNotesLabel": "নোট (ঐচ্ছিক)",
    "activityNotesPlaceholder": "যেমন: সবাই সকাল ৮টার মধ্যে রেডি থাকবে",
    "addItineraryButton": "সূচিতে যোগ করুন",
    "moveUp": "↑",
    "moveDown": "↓",
    "deleteItem": "মুছুন"
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
    "cross_trip_option": "এই ভোট অপশনটি এই ট্রিপের নয়।",
    "duplicate_option": "এই গন্তব্যটি ইতিমধ্যে তালিকায় যোগ করা আছে!"
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
    "nextStepsTitle": "AI Expense Parser & Share Card (Steps 6–7)",
    "nextStepsBody": "AI text parsing and downloadable daily cost sheets come in Steps 6–7."
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
  "planning": {
    "votingTitle": "Destination Voting",
    "votingSubtitle": "Where should the group go? Propose options and vote (1 vote per member)",
    "noOptionsYet": "No destination options proposed yet.",
    "optionPlaceholder": "e.g., Sajek Valley / Saint Martin",
    "addOptionButton": "Add option",
    "voteButton": "Vote",
    "votedBadge": "✓ Your vote",
    "topPickBadge": "🏆 Top pick",
    "proposedByPrefix": "Proposed by:",
    "votesCountSuffix": "votes",
    "setAsDestinationButton": "Set as final trip destination",
    "itineraryTitle": "Day-by-Day Itinerary",
    "itinerarySubtitle": "Simple daily plan of activities for the trip",
    "noItineraryYet": "No itinerary items added yet.",
    "dayNumberLabel": "Day *",
    "timeLabel": "Time (optional)",
    "timePlaceholder": "e.g., 09:30",
    "activityTitleLabel": "Activity *",
    "activityTitlePlaceholder": "e.g., Nilgiri visit & lunch",
    "activityNotesLabel": "Notes (optional)",
    "activityNotesPlaceholder": "e.g., Everyone ready by 8 AM",
    "addItineraryButton": "Add to itinerary",
    "moveUp": "↑",
    "moveDown": "↓",
    "deleteItem": "Delete"
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
    "cross_trip_option": "That destination vote option does not belong to this trip.",
    "duplicate_option": "That destination option is already on the list!"
  }
}
EOF

cat > "${PROJECT_DIR}/src/components/DestinationVotingCard.tsx" <<'EOF'
import {
  castDestinationVoteAction,
  proposeDestinationOptionAction,
  setTripDestinationFromOptionAction,
} from "@/app/trips/actions";
import { type SupportedLocale, toBanglaDigits } from "@/lib/format";
import type { DestinationOptionSummary } from "@/lib/planning";

export interface DestinationVotingCardLabels {
  votingTitle: string;
  votingSubtitle: string;
  noOptionsYet: string;
  optionPlaceholder: string;
  addOptionButton: string;
  voteButton: string;
  votedBadge: string;
  topPickBadge: string;
  proposedByPrefix: string;
  votesCountSuffix: string;
  setAsDestinationButton: string;
}

interface DestinationVotingCardProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  isCreator: boolean;
  currentTripDestination: string | null;
  options: DestinationOptionSummary[];
  labels: DestinationVotingCardLabels;
}

export function DestinationVotingCard({
  slug,
  locale,
  isLocked,
  isCreator,
  currentTripDestination,
  options,
  labels,
}: DestinationVotingCardProps) {
  function fmtNum(n: number): string {
    return locale === "bn" ? toBanglaDigits(n) : String(n);
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.votingTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.votingSubtitle}
        </p>
      </div>

      {/* Propose new destination option form */}
      {!isLocked ? (
        <form action={proposeDestinationOptionAction} className="flex gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder={labels.optionPlaceholder}
            className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
          >
            {labels.addOptionButton}
          </button>
        </form>
      ) : null}

      {/* Options & Vote tally list */}
      {options.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noOptionsYet}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {options.map((opt) => {
            const isSelectedDestination =
              currentTripDestination &&
              currentTripDestination.trim().toLowerCase() ===
                opt.name.trim().toLowerCase();

            return (
              <li
                key={opt.optionId}
                className={`space-y-2 rounded-xl border p-3 ${
                  opt.isCurrentMemberVote
                    ? "border-2 border-[var(--color-primary)] bg-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold text-[var(--color-fg)]">
                        {opt.name}
                      </span>
                      {opt.isLeading ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {labels.topPickBadge}
                        </span>
                      ) : null}
                    </div>
                    {opt.proposedByDisplayName ? (
                      <p className="text-xs text-[var(--color-fg-muted)]">
                        {labels.proposedByPrefix} {opt.proposedByDisplayName}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-[var(--color-primary)]">
                      {fmtNum(opt.voteCount)} {labels.votesCountSuffix} (
                      {fmtNum(opt.votePercent)}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full bg-[var(--color-primary)] transition-all motion-reduce:transition-none"
                    style={{ width: `${opt.votePercent}%` }}
                  />
                </div>

                {/* Voter pills */}
                {opt.voters.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {opt.voters.map((v) => (
                      <span
                        key={v.memberId}
                        className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--color-fg)]"
                      >
                        {v.emoji} {v.displayName}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Action buttons (Vote + Creator Set Final Destination) */}
                {!isLocked ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <form action={castDestinationVoteAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input
                        type="hidden"
                        name="optionId"
                        value={opt.optionId}
                      />
                      <button
                        type="submit"
                        disabled={opt.isCurrentMemberVote}
                        className={`inline-flex min-h-[38px] items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                          opt.isCurrentMemberVote
                            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                            : "bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                        }`}
                      >
                        {opt.isCurrentMemberVote
                          ? labels.votedBadge
                          : labels.voteButton}
                      </button>
                    </form>

                    {isCreator && !isSelectedDestination ? (
                      <form action={setTripDestinationFromOptionAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input
                          type="hidden"
                          name="optionId"
                          value={opt.optionId}
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-surface-muted)]"
                        >
                          {labels.setAsDestinationButton}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
EOF

cat > "${PROJECT_DIR}/src/components/ItineraryCard.tsx" <<'EOF'
import {
  addItineraryItemAction,
  deleteItineraryItemAction,
  moveItineraryItemAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
import type { ItineraryDayGroup } from "@/lib/planning";

export interface ItineraryCardLabels {
  itineraryTitle: string;
  itinerarySubtitle: string;
  noItineraryYet: string;
  dayNumberLabel: string;
  timeLabel: string;
  timePlaceholder: string;
  activityTitleLabel: string;
  activityTitlePlaceholder: string;
  activityNotesLabel: string;
  activityNotesPlaceholder: string;
  addItineraryButton: string;
  moveUp: string;
  moveDown: string;
  deleteItem: string;
}

interface ItineraryCardProps {
  slug: string;
  isLocked: boolean;
  dayGroups: ItineraryDayGroup[];
  labels: ItineraryCardLabels;
}

export function ItineraryCard({
  slug,
  isLocked,
  dayGroups,
  labels,
}: ItineraryCardProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.itineraryTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.itinerarySubtitle}
        </p>
      </div>

      {/* Add new itinerary item form */}
      {!isLocked ? (
        <form
          action={addItineraryItemAction}
          className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5"
        >
          <input type="hidden" name="slug" value={slug} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="it-day"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.dayNumberLabel}
              </label>
              <input
                id="it-day"
                name="dayNumber"
                type="text"
                inputMode="numeric"
                required
                defaultValue="1"
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-semibold text-[var(--color-fg)]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="it-time"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.timeLabel}
              </label>
              <input
                id="it-time"
                name="time"
                type="text"
                maxLength={20}
                placeholder={labels.timePlaceholder}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-title"
              className="block text-xs font-semibold text-[var(--color-fg)]"
            >
              {labels.activityTitleLabel}
            </label>
            <input
              id="it-title"
              name="title"
              type="text"
              required
              maxLength={120}
              placeholder={labels.activityTitlePlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-notes"
              className="block text-xs font-semibold text-[var(--color-fg)]"
            >
              {labels.activityNotesLabel}
            </label>
            <input
              id="it-notes"
              name="notes"
              type="text"
              maxLength={300}
              placeholder={labels.activityNotesPlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm text-[var(--color-fg)]"
            />
          </div>

          <Button type="submit" variant="secondary">
            {labels.addItineraryButton}
          </Button>
        </form>
      ) : null}

      {/* Day-by-day list */}
      {dayGroups.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noItineraryYet}
        </p>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((group) => (
            <div
              key={group.dayNumber}
              className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
            >
              <h3 className="border-b border-[var(--color-border)] pb-1.5 text-base font-bold text-[var(--color-primary)]">
                {group.label}
              </h3>

              <ol className="space-y-2">
                {group.items.map((item, idx) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-white p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.time ? (
                          <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-primary)]">
                            🕘 {item.time}
                          </span>
                        ) : null}
                        <span className="font-semibold text-[var(--color-fg)]">
                          {item.title}
                        </span>
                      </div>
                      {item.notes ? (
                        <p className="text-xs text-[var(--color-fg-muted)]">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    {!isLocked ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {idx > 0 ? (
                          <form action={moveItineraryItemAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="itemId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="direction"
                              value="up"
                            />
                            <button
                              type="submit"
                              aria-label="Move up"
                              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-fg)]"
                            >
                              {labels.moveUp}
                            </button>
                          </form>
                        ) : null}

                        {idx < group.items.length - 1 ? (
                          <form action={moveItineraryItemAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="itemId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="direction"
                              value="down"
                            />
                            <button
                              type="submit"
                              aria-label="Move down"
                              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-fg)]"
                            >
                              {labels.moveDown}
                            </button>
                          </form>
                        ) : null}

                        <form action={deleteItineraryItemAction}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            {labels.deleteItem}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
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
import { hasDuplicateDestinationOption } from "@/lib/planning";
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
  destinationOptionFormSchema,
  expenseFormSchema,
  itineraryItemFormSchema,
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

// ---- Step 5: Destination Voting & Day-by-Day Itinerary Actions -----------

export async function proposeDestinationOptionAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = destinationOptionFormSchema.safeParse({
    slug,
    name: formData.get("name") ?? "",
  });

  if (!parsed.success) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: { options: true },
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

  if (hasDuplicateDestinationOption(parsed.data.name, trip.options)) {
    redirect(`/trips/${trip.slug}?error=duplicate_option`);
  }

  await db.$transaction(async (tx) => {
    const option = await tx.destinationOption.create({
      data: {
        tripId: trip.id,
        name: parsed.data.name,
        proposedById: currentMember.id,
      },
    });

    // Automatically cast the proposer's vote for their newly proposed option
    await tx.vote.upsert({
      where: {
        tripId_memberId: {
          tripId: trip.id,
          memberId: currentMember.id,
        },
      },
      update: { optionId: option.id },
      create: {
        tripId: trip.id,
        memberId: currentMember.id,
        optionId: option.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "destination",
        entityId: option.id,
        action: "create",
        after: { name: option.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

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
        after: { name: option!.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function setTripDestinationFromOptionAction(
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
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const option = await db.destinationOption.findUnique({
    where: { id: optionId },
  });

  try {
    assertVoteOptionBelongsToTrip({
      tripId: trip.id,
      member: currentMember,
      option,
    });
  } catch {
    redirect(`/trips/${trip.slug}?error=cross_trip_option`);
  }

  await db.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: trip.id },
      data: { destination: option!.name },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "trip",
        entityId: trip.id,
        action: "set_destination",
        before: { destination: trip.destination },
        after: { destination: option!.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function addItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = itineraryItemFormSchema.safeParse({
    slug,
    dayNumber: formData.get("dayNumber") ?? "1",
    time: formData.get("time") ?? undefined,
    title: formData.get("title") ?? "",
    notes: formData.get("notes") ?? undefined,
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
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  await db.$transaction(async (tx) => {
    const existingForDay = await tx.itineraryItem.findMany({
      where: {
        tripId: trip.id,
        dayNumber: parsed.data.dayNumber,
      },
      orderBy: { position: "desc" },
      take: 1,
    });

    const nextPosition = (existingForDay[0]?.position ?? 0) + 1;

    const item = await tx.itineraryItem.create({
      data: {
        tripId: trip.id,
        dayNumber: parsed.data.dayNumber,
        time: parsed.data.time ?? null,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        position: nextPosition,
        createdById: currentMember.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "itinerary",
        entityId: item.id,
        action: "create",
        after: {
          title: item.title,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function moveItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();

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

  const target = await db.itineraryItem.findUnique({
    where: { id: itemId },
  });

  if (!target || target.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}`);
  }

  const dayItems = await db.itineraryItem.findMany({
    where: {
      tripId: trip.id,
      dayNumber: target.dayNumber,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const idx = dayItems.findIndex((i) => i.id === target.id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  const neighbor = dayItems[swapIdx];

  if (idx >= 0 && neighbor) {
    await db.$transaction(async (tx) => {
      // Normalize positions sequentially and swap idx with swapIdx
      for (let i = 0; i < dayItems.length; i++) {
        let newPos = i + 1;
        if (i === idx) newPos = swapIdx + 1;
        else if (i === swapIdx) newPos = idx + 1;

        await tx.itineraryItem.update({
          where: { id: dayItems[i]!.id },
          data: { position: newPos },
        });
      }
    });
  }

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();

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

  const existing = await db.itineraryItem.findUnique({
    where: { id: itemId },
  });

  if (!existing || existing.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}`);
  }

  await db.$transaction(async (tx) => {
    await tx.itineraryItem.delete({
      where: { id: existing.id },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "itinerary",
        entityId: existing.id,
        action: "delete",
        before: { title: existing.title },
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
import { DestinationVotingCard } from "@/components/DestinationVotingCard";
import {
  type EditableExpenseData,
  type ExistingExpenseSummary,
  ExpenseFormCard,
} from "@/components/ExpenseFormCard";
import { ItineraryCard } from "@/components/ItineraryCard";
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
import {
  groupItineraryByDay,
  summarizeDestinationVotes,
} from "@/lib/planning";
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
  | "cross_trip_option"
  | "duplicate_option";

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
  "duplicate_option",
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
      options: {
        orderBy: { createdAt: "asc" },
      },
      votes: true,
      itinerary: {
        orderBy: [{ dayNumber: "asc" }, { position: "asc" }, { createdAt: "asc" }],
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
  const tPlan = await getTranslations("planning");
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

  // 2. Signed-in Trip Hub View + Step 3 Money Core + Step 4 Safety + Step 5 Voting & Itinerary
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

  const voteSummary = summarizeDestinationVotes({
    options: trip.options,
    votes: trip.votes,
    members: memberInputs,
    currentMemberId: currentMember.id,
  });

  const itineraryDayGroups = groupItineraryByDay({
    items: trip.itinerary,
    tripStartDate: trip.startDate,
    locale,
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

      {/* Step 5.1: Destination Voting (1 vote per member) */}
      <DestinationVotingCard
        slug={trip.slug}
        locale={locale}
        isLocked={isLocked}
        isCreator={isCreator}
        currentTripDestination={trip.destination}
        options={voteSummary.options}
        labels={{
          votingTitle: tPlan("votingTitle"),
          votingSubtitle: tPlan("votingSubtitle"),
          noOptionsYet: tPlan("noOptionsYet"),
          optionPlaceholder: tPlan("optionPlaceholder"),
          addOptionButton: tPlan("addOptionButton"),
          voteButton: tPlan("voteButton"),
          votedBadge: tPlan("votedBadge"),
          topPickBadge: tPlan("topPickBadge"),
          proposedByPrefix: tPlan("proposedByPrefix"),
          votesCountSuffix: tPlan("votesCountSuffix"),
          setAsDestinationButton: tPlan("setAsDestinationButton"),
        }}
      />

      {/* Step 5.2: Day-by-Day Itinerary */}
      <ItineraryCard
        slug={trip.slug}
        isLocked={isLocked}
        dayGroups={itineraryDayGroups}
        labels={{
          itineraryTitle: tPlan("itineraryTitle"),
          itinerarySubtitle: tPlan("itinerarySubtitle"),
          noItineraryYet: tPlan("noItineraryYet"),
          dayNumberLabel: tPlan("dayNumberLabel"),
          timeLabel: tPlan("timeLabel"),
          timePlaceholder: tPlan("timePlaceholder"),
          activityTitleLabel: tPlan("activityTitleLabel"),
          activityTitlePlaceholder: tPlan("activityTitlePlaceholder"),
          activityNotesLabel: tPlan("activityNotesLabel"),
          activityNotesPlaceholder: tPlan("activityNotesPlaceholder"),
          addItineraryButton: tPlan("addItineraryButton"),
          moveUp: tPlan("moveUp"),
          moveDown: tPlan("moveDown"),
          deleteItem: tPlan("deleteItem"),
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

      {/* Placeholder for Step 6–7 features */}
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

cat > "${PROJECT_DIR}/docs/STEP5-VERIFY.md" <<'EOF'
# Step 5 — Manual Acceptance Verification Checklist (Destination Voting & Itinerary)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Destination Options & One Vote Per Member
- [ ] Scroll to **গন্তব্য নির্বাচন ও ভোট (`Destination Voting`)** and add two destination options: `সুন্দরবন` and `সাজেক ভ্যালি`.
- [ ] Verify that proposing an option automatically casts your vote for it (`১ ভোট (১০০%)` / `✓ আপনার ভোট`).
- [ ] Try proposing a duplicate option (`সুন্দরবন` or `  সুন্দরবন `). Verify it is rejected with the duplicate-option error.
- [ ] Click **ভোট দিন (`Vote`)** on the other option (`সুন্দরবন`). Verify your vote moves from `সাজেক ভ্যালি` to `সুন্দরবন` (still 1 vote total for your member, enforced by `@@unique([tripId, memberId])`).
- [ ] Switch to a second member (using **নাম পরিবর্তন / রিক্লেইম টেস্ট করুন**) and vote for `সুন্দরবন`. Verify `সুন্দরবন` shows `২ ভোট (১০০%)`, both member badges (`🐅 Karim`, `🌴 Sumi`), and the **🏆 শীর্ষ পছন্দ (`🏆 Top pick`)** badge.
- [ ] As the trip creator, click **ট্রিপের চূড়ান্ত গন্তব্য করুন (`Set as final trip destination`)** on the winning option and verify the trip header updates its destination.

## 2. Day-by-Day Itinerary (Add, Order, Reorder & Delete)
- [ ] Scroll to **প্রতিদিনের ভ্রমণ সূচি (`Day-by-Day Itinerary`)** and add 2 items for Day 1 (`দিন: ১`):
  - Time: `08:30`, Activity: `খুলনা ঘাট থেকে লঞ্চে যাত্রা`, Notes: `সকাল ৮টার মধ্যে ঘাটে উপস্থিত থাকতে হবে`
  - Time: `13:30`, Activity: `হাড়বাড়িয়া ইকো ট্যুরিজম কেন্দ্র ভ্রমণ`
- [ ] Add 1 item for Day 2 (`দিন: ২`):
  - Time: `06:00`, Activity: `কটকা অভয়ারণ্যে ভোরের ট্রেইল`
- [ ] Verify the items are grouped under **দিন ১ · ১৬ অক্টো, ২০২৬** and **দিন ২ · ১৭ অক্টো, ২০২৬** (matching the trip's `Asia/Dhaka` start date).
- [ ] Click the **`↑`** / **`↓`** buttons on Day 1's items and verify their order swaps cleanly.
- [ ] Click **মুছুন (`Delete`)** on an item and verify it is removed and logged in the Activity Log.
EOF

