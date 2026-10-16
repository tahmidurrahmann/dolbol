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
