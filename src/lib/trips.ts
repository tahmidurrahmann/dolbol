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
  rawInput: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  routeFrom: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  routeTo: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  placeName: z
    .string()
    .trim()
    .max(80)
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
  name: z
    .string()
    .trim()
    .min(1, "option_name_required")
    .max(80, "option_name_long"),
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
