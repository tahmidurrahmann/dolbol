import { z } from "zod";
import { banglaToAsciiDigits, normalizeNameKey } from "@/lib/names";

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
  friendsNames: z.string().trim().optional(),
  creatorEmoji: optionalEmojiString,
  creatorPin: optionalPinString,
});

const HONORIFIC_PREFIXES = new Set([
  "md",
  "mohd",
  "dr",
  "prof",
  "engr",
  "adv",
  "mr",
  "mrs",
  "ms",
  "janab",
  "sheikh",
  "syed",
  "kazi",
  "al",
  "capt",
  "col",
  "maj",
  "lt",
  "bar",
  "haji",
  "hazi",
  "প্রো",
  "ইঞ্জি",
]);

export interface ParseFriendsNamesOptions {
  creatorName?: string;
  maxCount?: number;
}

/**
 * Parses user input for friends' names from flexible formats:
 * - Newlines (\n, \r\n)
 * - Commas (,, ，, ،)
 * - Semicolons (;,)
 * - Pipes (|), Slashes (/)
 * - Bengali Dari (।)
 * - Numbered lists ("1. Karim 2. Tanvir", "১. করিম ২. তানভীর", "1) Karim", "1- Karim", "1: Karim")
 * - Bullet lists ("- Karim", "• Tanvir", "* Nusrat")
 * - Hyphens with surrounding spaces ("Karim - Tanvir" while preserving "Al-Amin")
 * - Ampersand / plus / "and" / "এবং" / "ও" with spaces
 * - Periods used as sentence/item separators (while preserving initials like "Md. Sakib", "A. K. M. Tahmidur")
 *
 * Ensures:
 * - Multi-word single names like "tahmidur rahman sakib" remain one name.
 * - Leading/trailing punctuation is stripped.
 * - Deduplication is case-insensitive.
 * - Creator's name is not duplicated.
 * - Maximum count (default 30) is enforced.
 */
export function parseFriendsNames(
  rawInput: string | undefined | null,
  options?: ParseFriendsNamesOptions,
): string[] {
  if (!rawInput) return [];

  let text = rawInput.trim();
  if (text.length === 0) return [];

  // 1. Convert numbered list prefixes ("1.", "2)", "১.", "২)", "1-", "1:") to newlines
  text = text.replace(/(?:^|\s)(?:[0-9]+|[০-৯]+)[\.\)\-:]\s*/gu, "\n");

  // 2. Convert hyphens/dashes with surrounding spaces to newlines (preserves intra-word "Al-Amin")
  text = text.replace(/\s+[-–—]\s+/gu, "\n");

  // 3. Convert explicit list delimiters (commas, semicolons, Dari, pipes, newlines) to newlines
  text = text.replace(/[,;，؛|।\r\n]+/gu, "\n");

  // 4. Convert slashes with optional spaces to newlines
  text = text.replace(/\s*[\/\\]\s*/gu, "\n");

  // 5. Convert conjunctions (&, +, and, এবং, ও) with surrounding spaces to newlines
  text = text.replace(/\s+(?:&|\+|and|এবং|ও)\s+/giu, "\n");

  // 6. Handle periods: If preceded by a full word (>= 4 letters, not honorific) and followed by whitespace or letter
  text = text.replace(
    /([\p{L}\p{M}]{4,})\.\s*(?=[\p{L}\p{M}])/gu,
    (match, word) => {
      if (HONORIFIC_PREFIXES.has(word.toLowerCase())) {
        return match;
      }
      return `${word}\n`;
    },
  );

  const rawTokens = text.split("\n");
  const result: string[] = [];
  const seenKeys = new Set<string>();

  if (options?.creatorName && options.creatorName.trim().length > 0) {
    seenKeys.add(normalizeNameKey(options.creatorName));
  }

  const maxCount = options?.maxCount ?? 30;

  for (let token of rawTokens) {
    // Strip leading bullets, numbers, dashes, quotes, at-signs, brackets
    token = token.replace(/^[•◦▪▫–—\-\*\+@#"'“”‘’`\(\)\[\]\{\}\s]+/, "");
    // Strip trailing punctuation
    token = token.replace(/[.,;।:–—\-\*"'“”‘’`\(\)\[\]\{\}\s]+$/, "");
    // Collapse internal spaces
    token = token.replace(/\s+/g, " ").trim();

    if (!token || token.length === 0) continue;
    if (token.length > 40) {
      token = token.slice(0, 40).trim();
    }
    // Must contain at least one letter or alphanumeric character
    if (!/[\p{L}\p{N}]/u.test(token)) continue;

    const key = normalizeNameKey(token);
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    result.push(token);

    if (result.length >= maxCount) break;
  }

  return result;
}

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
