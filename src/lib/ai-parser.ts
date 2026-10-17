import { z } from "zod";
import { banglaToAsciiDigits, normalizeNameKey } from "@/lib/crypto";
import type { ExpenseCategoryValue, MemberInput } from "@/lib/money";
import { EXPENSE_CATEGORIES, SPLIT_TYPES } from "@/lib/trips";

export class NormalizeInputError extends Error {
  readonly code:
    | "too_many_lines"
    | "line_too_long"
    | "input_too_long"
    | "empty_input";

  constructor(
    code: "too_many_lines" | "line_too_long" | "input_too_long" | "empty_input",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "NormalizeInputError";
    this.code = code;
  }
}

const QUANTITY_CLASSIFIERS =
  /^(?:ta|টা|টি|ti|jon|জন|piece|pieces|pc|pcs|kg|gm|g|gram|grams|liter|litre|l|ml|packet|packets|cup|cups|plate|plates)\b/i;

function splitByAmountBoundaries(text: string): string[] {
  // Check if text has at least 2 numbers
  const numberMatches = [...text.matchAll(/\d+(?:\.\d+)?/g)];
  if (numberMatches.length < 2) {
    return [text];
  }

  // Regex to find amount: number followed by optional currency/unit, followed by whitespace and a word
  // e.g. '1200  dupurer' or '1200tk dupurer' or '1200/- dupurer'
  const pattern =
    /(?:^|\s|[^\d.])(\d+(?:\.\d+)?)\s*(?:tk|taka|টাকা|\/-)?(?=\s+[a-zA-Z\u0980-\u09FF])/gi;

  const splitPoints: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchEnd = match.index + fullMatch.length;
    const remainder = text.slice(matchEnd).trim();

    // Check if next word is a quantity classifier (e.g. '2 ta 600')
    if (QUANTITY_CLASSIFIERS.test(remainder)) {
      continue;
    }

    // Check if there is another number in the remainder
    if (/\d+/.test(remainder)) {
      splitPoints.push(matchEnd);
    }
  }

  if (splitPoints.length === 0) {
    return [text];
  }

  const parts: string[] = [];
  let prev = 0;
  for (const pt of splitPoints) {
    const chunk = text.slice(prev, pt).trim();
    if (chunk) parts.push(chunk);
    prev = pt;
  }
  const lastChunk = text.slice(prev).trim();
  if (lastChunk) parts.push(lastChunk);

  return parts;
}

function splitIntoExpenseLines(text: string): string[] {
  const initialLines = text.split(/\r?\n/);
  const result: string[] = [];

  for (const line of initialLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split on Bangla Dari '।' or semicolon ';' or period followed by whitespace or end of line.
    // Preserves decimals (e.g. 12.50) since \. must be followed by whitespace or string end.
    const sentenceParts = trimmed
      .split(/(?:[;।]|\.(?:\s+|$))/g)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const part of sentenceParts) {
      let segmentsToProcess: string[] = [part];

      if (part.includes(",")) {
        const commaSegments = part
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const segmentsWithNumbers = commaSegments.filter((s) => /\d+/.test(s));
        if (segmentsWithNumbers.length >= 2) {
          segmentsToProcess = commaSegments;
        }
      }

      for (const seg of segmentsToProcess) {
        // Check if this segment contains multiple space-separated expenses ending with numbers
        // e.g. "Shokaler nasta 250 dupurer khabar 800" or "rater khabar 1200 dupurer khawon 200"
        const subParts = splitByAmountBoundaries(seg);
        result.push(...subParts);
      }
    }
  }

  return result;
}

/**
 * Normalizes multi-line expense text while strictly keeping line breaks and sentence delimiters.
 * Converts Bangla digits, trims each line, collapses spaces within lines only, drops empty lines.
 * Limits: max 15 lines, max 200 chars/line, max 1500 chars total.
 */
export function normalizeInput(rawText: string): string {
  if (rawText.length > 1500) {
    throw new NormalizeInputError(
      "input_too_long",
      "Input exceeds maximum limit of 1500 characters.",
    );
  }

  const asciiText = banglaToAsciiDigits(rawText);
  const rawLines = splitIntoExpenseLines(asciiText);
  const cleanedLines: string[] = [];

  for (const rawLine of rawLines) {
    // Collapse horizontal spaces within line only
    const collapsed = rawLine.replace(/[^\S\r\n]+/g, " ").trim();
    if (collapsed.length > 0) {
      if (collapsed.length > 200) {
        throw new NormalizeInputError(
          "line_too_long",
          "A single line cannot exceed 200 characters.",
        );
      }
      cleanedLines.push(collapsed);
    }
  }

  if (cleanedLines.length === 0) {
    throw new NormalizeInputError(
      "empty_input",
      "Input contains no valid expense lines.",
    );
  }

  if (cleanedLines.length > 15) {
    throw new NormalizeInputError(
      "too_many_lines",
      "Input exceeds maximum limit of 15 lines.",
    );
  }

  return cleanedLines.join("\n");
}

export function getNormalizedLines(rawText: string): string[] {
  const normalized = normalizeInput(rawText);
  return normalized.split("\n");
}

/**
 * Strict Zod schema for validating AI / parser output before showing the Confirm Card.
 */
export const parsedExpenseDraftSchema = z.object({
  lineIndex: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(1).max(100),
  amount: z.number().int().positive().max(10_000_000).nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  paidByMemberId: z.string().min(1),
  paidByMatchedName: z.string().min(1),
  participantMemberIds: z.array(z.string().min(1)).min(1),
  splitType: z.enum(SPLIT_TYPES).default("EQUAL"),
  note: z.string().max(200).nullable().default(null),
  rawInput: z.string().trim().min(1).max(500),
  routeFrom: z.string().max(80).nullable().default(null),
  routeTo: z.string().max(80).nullable().default(null),
  placeName: z.string().max(80).nullable().default(null),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  parserSource: z
    .enum(["llm", "deterministic", "fallback"])
    .default("deterministic"),
  isSettlement: z.boolean().default(false),
  receiverMemberId: z.string().nullable().default(null),
  receiverMatchedName: z.string().nullable().default(null),
  question: z.string().nullable().default(null),
  needsAttention: z.boolean().default(false),
});

export type ParsedExpenseDraft = z.infer<typeof parsedExpenseDraftSchema>;

/**
 * Schema for raw LLM JSON responses before member IDs are resolved against trip.members.
 */
export const rawLlmExpenseItemSchema = z.object({
  lineIndex: z.number().int().nonnegative().optional().default(0),
  title: z.string().trim().min(1).max(100),
  amount: z.number().int().positive().max(10_000_000).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional().default("OTHER"),
  payerName: z.string().trim().nullable().optional(),
  participantNames: z.array(z.string().trim()).optional(),
  isEveryone: z.boolean().optional(),
  isSettlement: z.boolean().optional().default(false),
  receiverName: z.string().trim().nullable().optional(),
  routeFrom: z.string().trim().max(80).nullable().optional(),
  routeTo: z.string().trim().max(80).nullable().optional(),
  placeName: z.string().trim().max(80).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional().default("high"),
  question: z.string().trim().nullable().optional(),
  needsAttention: z.boolean().optional().default(false),
});

export const rawLlmExpenseResponseSchema = z.object({
  items: z.array(rawLlmExpenseItemSchema),
});

// Phonetic transliteration table for common Bangladeshi names & Bangla characters
const BANGLA_TO_PHONETIC_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/করিম/g, "karim"],
  [/রহিম/g, "rahim"],
  [/সুমি/g, "sumi"],
  [/তানভীর|তানভির/g, "tanvir"],
  [/নাবিলা/g, "nabila"],
  [/মামুন/g, "mamun"],
  [/সাকিব|শাকিব/g, "sakib"],
  [/রাফি/g, "rafi"],
  [/ফারহান/g, "farhan"],
  [/তাসনুভা/g, "tasnuva"],
  [/জাহিদ/g, "jahid"],
  [/সাদিয়া/g, "sadia"],
  [/আরিফ/g, "arif"],
  [/নাসিম/g, "nasim"],
  [/তারেক/g, "tarek"],
  [/শামীম|সামিম/g, "shamim"],
  [/ইমরান/g, "imran"],
  [/রুবেল/g, "rubel"],
  [/সোহাগ/g, "sohag"],
  [/মিতু/g, "mitu"],
  [/রিয়া/g, "riya"],
  [/অনন্যা/g, "ananya"],
];

function toPhoneticKey(raw: string): string {
  let s = normalizeNameKey(raw)
    .replace(/\(guest\)/gi, "")
    .replace(/গেস্ট/g, "")
    .trim();

  for (const [pattern, replacement] of BANGLA_TO_PHONETIC_MAP) {
    s = s.replace(pattern, replacement);
  }

  // Strip common Bangla possessive/case suffixes on names: -এর, -কে, -রা
  s = s
    .replace(/(ের|কে|রা)(?=\s|$|,)/g, "")
    .replace(/\b(er|ke|ভাই|আপু|bhai|apu)\b/gi, "")
    .trim();

  // Normalize common vowel/consonant variations in Banglish (korim -> karim, shumi -> sumi, tanbir -> tanvir)
  s = s
    .replace(/\bkorim\b/g, "karim")
    .replace(/\brohim\b/g, "rahim")
    .replace(/\bshumi\b/g, "sumi")
    .replace(/\btanbir\b/g, "tanvir")
    .replace(/\bshakib\b/g, "sakib");

  return s.replace(/\s+/g, " ").trim();
}

export interface MemberAliasEntry {
  member: MemberInput;
  aliases: string[];
}

export function buildMemberAliasIndex(
  members: ReadonlyArray<MemberInput>,
): MemberAliasEntry[] {
  return members.map((member) => {
    const cleanDisplay = normalizeNameKey(member.displayName)
      .replace(/\(guest\)/gi, "")
      .trim();
    const firstWord = cleanDisplay.split(" ")[0] ?? cleanDisplay;
    const phoneticFull = toPhoneticKey(cleanDisplay);
    const phoneticFirst = toPhoneticKey(firstWord);

    const aliasSet = new Set<string>(
      [cleanDisplay, firstWord, phoneticFull, phoneticFirst].filter(
        (a) => a.length > 0,
      ),
    );

    // Add Bangla script equivalents & common Banglish spellings if displayName matches
    for (const [bnRegex, latin] of BANGLA_TO_PHONETIC_MAP) {
      if (phoneticFirst === latin) {
        const bnSources = bnRegex.source.split("|");
        for (const src of bnSources) {
          aliasSet.add(src);
        }
      }
    }
    if (phoneticFirst === "karim") aliasSet.add("korim");
    if (phoneticFirst === "sumi") aliasSet.add("shumi");
    if (phoneticFirst === "tanvir") aliasSet.add("tanbir");

    return {
      member,
      aliases: Array.from(aliasSet),
    };
  });
}

/**
 * Matches a single candidate name string (Bangla or Banglish) to a trip Member.
 */
export function matchTripMemberByName(
  candidateName: string,
  members: ReadonlyArray<MemberInput>,
  currentMemberId?: string,
): MemberInput | null {
  const norm = normalizeNameKey(candidateName);
  if (!norm) return null;

  // First-person pronoun check ("আমি", "আমার", "ami", "amar", "me", "i")
  if (currentMemberId && /^(আমি|আমার|ami|amar|me|i|myself)$/i.test(norm)) {
    return members.find((m) => m.id === currentMemberId) ?? null;
  }

  const index = buildMemberAliasIndex(members);
  const candidatePhonetic = toPhoneticKey(norm);

  for (const entry of index) {
    if (
      entry.aliases.includes(norm) ||
      entry.aliases.includes(candidatePhonetic)
    ) {
      return entry.member;
    }
  }

  // Prefix / substring fallback
  for (const entry of index) {
    if (
      entry.aliases.some(
        (alias) =>
          alias.length >= 3 &&
          (candidatePhonetic.startsWith(alias) ||
            alias.startsWith(candidatePhonetic)),
      )
    ) {
      return entry.member;
    }
  }

  return null;
}

const CATEGORY_KEYWORDS: ReadonlyArray<{
  category: ExpenseCategoryValue;
  pattern: RegExp;
}> = [
  {
    category: "TICKET",
    pattern:
      /(উপহার|গিফট|কেনাকাটা|শপিং|দরকারি|প্রয়োজনীয়|জিনিস|ওষুধ|মেডিসিন|সাবান|টিকিট|টিকেট|gift|gifts|necessary|items|item|shopping|medicine|soap|ticket|tickets|এন্ট্রি|entry\s*fee|পাস|জাদুঘর|পার্ক\s*ফি|সফারি)/i,
  },
  {
    category: "TRANSPORT",
    pattern:
      /(রাইড|যাতায়াত|ভাড়া|বাস|ট্রেন|লঞ্চ|সিএনজি|অটো|রিকশা|ট্যাক্সি|উবার|পাঠাও|বোট|নৌকা|ট্রলার|জীপ|জিপ|চাঁদের\s*গাড়ি|গাড়ি|ফ্লাইট|বিমান|ফেরি|স্পিডবোট|ride|rides|uber|pathao|cng|bus|train|launch|auto|rickshaw|boat|trawler|jeep|chander\s*gari|fare|bhara|vara|transport|flight|ferry|speedboat)/i,
  },
  {
    category: "HOTEL",
    pattern:
      /(হোটেল|রিসোর্ট|কটেজ|রুম|চেক-ইন|চেকইন|থাকা|ক্যাম্পিং|তাঁবু|hotel|resort|cottage|room|stay|check-in|checkin|tent|villa|motel)/i,
  },
  {
    category: "FOOD",
    pattern:
      /(খাবার|নাস্তা|লাঞ্চ|ডিনার|ব্রেকফাস্ট|দুপুরের\s*খাবার|রাতের\s*খাবার|সকালের\s*নাস্তা|বিরিয়ানি|কাচ্চি|ভাত|মাছ|সিফুড|বারবিকিউ|চা|কফি|পানি|জুস|স্ন্যাকস|রেস্টুরেন্ট|ডাব|ফুচকা|খাওন|খাওয়া|food|breakfast|lunch|dinner|snacks|tea|cha|coffee|biryani|kacchi|seafood|bbq|barbecue|water|restaurant|meal|drink|dab|khabar|nasta|khawon|khawa)/i,
  },
];

export function detectExpenseCategory(text: string): ExpenseCategoryValue {
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.pattern.test(text)) {
      return rule.category;
    }
  }
  return "OTHER";
}

/**
 * Extracts whole-taka integer amount from Bangla/Banglish/English text.
 */
export function extractAmountFromText(rawText: string): number | null {
  const asciiText = banglaToAsciiDigits(rawText);

  if (/দেড়\s*হাজার|der\s*hajar/i.test(asciiText)) return 1500;
  if (/আড়াই\s*হাজার|arai\s*hajar/i.test(asciiText)) return 2500;
  if (/এক\s*হাজার|ek\s*hajar/i.test(asciiText)) return 1000;
  if (/দুই\s*হাজার|dui\s*hajar/i.test(asciiText)) return 2000;
  if (/তিন\s*হাজার|tin\s*hajar/i.test(asciiText)) return 3000;
  if (/পাঁচ\s*হাজার|pach\s*hajar/i.test(asciiText)) return 5000;
  if (/পাঁচশো|পাঁচশ|pachsho/i.test(asciiText)) return 500;

  const explicitCurrencyMatch = asciiText.match(
    /(?:৳|tk\.?|taka|bdt)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?|(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?\s*(?:টাকা|tk\.?|taka|bdt|৳)/i,
  );

  if (explicitCurrencyMatch) {
    const numStr = (
      explicitCurrencyMatch[1] ??
      explicitCurrencyMatch[3] ??
      ""
    ).replace(/,/g, "");
    const hasK = Boolean(explicitCurrencyMatch[2] ?? explicitCurrencyMatch[4]);
    const val = Number(numStr) * (hasK ? 1000 : 1);
    const rounded = Math.round(val);
    if (Number.isInteger(rounded) && rounded > 0 && rounded <= 10_000_000) {
      return rounded;
    }
  }

  const allNumbers = Array.from(
    asciiText.matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?\b/gi),
  )
    .map((m) => {
      const raw = (m[1] ?? "").replace(/,/g, "");
      const hasK = Boolean(m[2]);
      return Math.round(Number(raw) * (hasK ? 1000 : 1));
    })
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 10_000_000);

  if (allNumbers.length === 0) {
    return null;
  }

  // If there's an ambiguous count followed by amount (e.g. 2 ta 600) pick the likely amount
  const countPatternMatch = asciiText.match(
    /\b(\d+)\s*(?:ta|টা|টি|jon|জন|piece|pc|copies)\s+(\d+)\b/i,
  );
  if (countPatternMatch && countPatternMatch[2]) {
    const candidate = Number(countPatternMatch[2]);
    if (candidate > 0 && candidate <= 10_000_000) {
      return candidate;
    }
  }

  const significant = allNumbers.filter((n) => n >= 10);
  return significant.length > 0 ? significant[0]! : allNumbers[0]!;
}

/**
 * Extracts payer and participant member IDs from Bangla or Banglish natural text.
 */
export function extractPayerAndParticipants(args: {
  text: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): {
  paidByMember: MemberInput;
  participantIds: string[];
} {
  const { text, members, currentMemberId } = args;
  const aliasIndex = buildMemberAliasIndex(members);
  const currentMember =
    members.find((m) => m.id === currentMemberId) ?? members[0]!;

  let paidByMember: MemberInput | null = null;

  if (
    /(আমি|আমার)\s*(দিয়েছি|দিছি|বিল\s*দিয়েছি|পে\s*করেছি|দিলাম)|\b(ami\s*(disi|dilo|dilam|paid|pay\s*korsi|bill\s*disi)|i\s*paid|paid\s*by\s*me)\b/i.test(
      text,
    )
  ) {
    paidByMember = currentMember;
  }

  if (!paidByMember) {
    for (const entry of aliasIndex) {
      for (const alias of entry.aliases) {
        if (alias.length < 2) continue;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const payerBeforeVerb = new RegExp(
          `(?:^|[\\s,])${escaped}(?:ের|কে)?\\s+(?:টাকা\\s+)?(?:দিয়েছে|দিছে|দিল|দিলো|বিল\\s*দিয়েছে|পে\\s*করেছে|paid|dilo|dise|disi|pay\\s*korse|pay\\s*korsi|bill\\s*dise|gave)`,
          "i",
        );
        const payerAfterPrep = new RegExp(
          `(?:paid\\s+by|বিল\\s*দিয়েছে|দিয়েছে|dilo)\\s+${escaped}`,
          "i",
        );
        if (payerBeforeVerb.test(text) || payerAfterPrep.test(text)) {
          paidByMember = entry.member;
          break;
        }
      }
      if (paidByMember) break;
    }
  }

  const mentionsEveryone =
    /(সবাই|সবার|সকলের|everyone|everybody|all\s*of\s*us|shobai|sobai|sobar|shobar)/i.test(
      text,
    );

  let subsetClause: string | null = null;
  const subsetPatterns = [
    /(?:শুধু|শুধুমাত্র|only)\s+([^.;]+)/i,
    /(?:for|between|among)\s+([^.;]+)/i,
    /([^\s,]+(?:\s*(?:,|আর|এবং|ও|and|&)\s*[^\s,]+)+)\s*(?:এর\s*জন্য|এর\s*মধ্যে|ভাগ|share|er\s*jonno)/i,
  ];

  for (const pat of subsetPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      subsetClause = m[1];
      break;
    }
  }

  const allMentionedMembers: MemberInput[] = [];
  for (const entry of aliasIndex) {
    const matched = entry.aliases.some((alias) => {
      if (alias.length < 2) return false;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `(?:^|[\\s,()&-])(${escaped})(?:ের|কে|রা)?(?=\\s|$|[\\s,()&-])`,
        "i",
      );
      return re.test(text) || re.test(toPhoneticKey(text));
    });
    if (matched) {
      allMentionedMembers.push(entry.member);
    }
  }

  if (!paidByMember) {
    if (allMentionedMembers.length >= 1) {
      paidByMember = allMentionedMembers[0]!;
    } else {
      paidByMember = currentMember;
    }
  }

  if (mentionsEveryone) {
    return {
      paidByMember,
      participantIds: members.map((m) => m.id),
    };
  }

  if (subsetClause) {
    const cleanedSubsetClause = subsetClause.replace(
      /,\s*[^,]*(?:দিয়েছে|দিছে|paid|dilo|dise).*$/i,
      "",
    );
    const subsetMembers: string[] = [];
    for (const entry of aliasIndex) {
      const inSubset = entry.aliases.some((alias) => {
        if (alias.length < 2) return false;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(
          `(?:^|[\\s,()&-])(${escaped})(?:ের|কে|রা)?(?=\\s|$|[\\s,()&-])`,
          "i",
        );
        return (
          re.test(cleanedSubsetClause) ||
          re.test(toPhoneticKey(cleanedSubsetClause))
        );
      });
      if (inSubset) {
        subsetMembers.push(entry.member.id);
      }
    }
    if (subsetMembers.length > 0) {
      return {
        paidByMember,
        participantIds: Array.from(new Set(subsetMembers)),
      };
    }
  }

  if (allMentionedMembers.length >= 2) {
    return {
      paidByMember,
      participantIds: Array.from(new Set(allMentionedMembers.map((m) => m.id))),
    };
  }

  return {
    paidByMember,
    participantIds: members.map((m) => m.id),
  };
}

/**
 * Extracts a clean, concise expense title from the raw Bangla/Banglish input.
 */
export function extractCleanTitle(
  rawText: string,
  members: ReadonlyArray<MemberInput>,
  category: ExpenseCategoryValue,
): string {
  let cleaned = rawText
    .replace(/(?:৳|tk\.?|taka|bdt)\s*[০-৯0-9,]+(?:\.[0-9]+)?\s*k?/gi, " ")
    .replace(/[০-৯0-9,]+(?:\.[0-9]+)?\s*k?\s*(?:টাকা|tk\.?|taka|bdt|৳)/gi, " ")
    .replace(
      /(দেড়\s*হাজার|আড়াই\s*হাজার|এক\s*হাজার|দুই\s*হাজার|তিন\s*হাজার|পাঁচ\s*হাজার|পাঁচশো)\s*টাকা?/gi,
      " ",
    )
    .replace(
      /\b(paid\s+by\s+[a-z]+|for\s+everyone|for\s+all|shobai|sobai|everyone|shobar\s*jonno)\b/gi,
      " ",
    )
    .replace(
      /(সবাই|সবার\s*জন্য|বিল\s*দিয়েছে|টাকা\s*দিয়েছে|দিয়েছে|দিছে|দিল|দিলো|পে\s*করেছে|আমি\s*দিয়েছি|আমি\s*দিছি|ami\s*disi|ami\s*dilo|dilo|dise|paid)/gi,
      " ",
    )
    // Strip standalone numbers representing prices/amounts so the amount isn't duplicated in "What was it for?"
    // Preserves quantities like "2 ta", "২ টি", "3 pcs"
    .replace(
      /(?:^|\s)[০-৯0-9,]+(?:\.[0-9]+)?\s*k?(?=\s+(?!ta\b|টা\b|টি\b|ti\b|jon\b|জন\b|piece\b|pc\b|copies\b|kg\b|plate\b|cup\b)[a-zA-Z\u0980-\u09FF]|\s*(?:$|[;,.]))/gi,
      " ",
    );

  const aliasIndex = buildMemberAliasIndex(members);
  for (const entry of aliasIndex) {
    for (const alias of entry.aliases) {
      if (alias.length < 2) continue;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(
        new RegExp(
          `(?:^|[\\s,()&-])(${escaped})(?:ের|কে|রা)?(?=\\s|$|[\\s,()&-])`,
          "gi",
        ),
        " ",
      );
    }
  }

  cleaned = cleaned
    .replace(
      /\b(for|and|between|only|শুধু|আর|এবং|ও|এর|জন্য|মধ্যে|ami|i)\b/gi,
      " ",
    )
    .replace(/[,:;—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length >= 2) {
    return cleaned.slice(0, 100);
  }

  const defaultTitles: Record<ExpenseCategoryValue, string> = {
    FOOD: "খাবার খরচ (Food)",
    TRANSPORT: "যাতায়াত ভাড়া (Transport)",
    HOTEL: "হোটেল ভাড়া (Hotel)",
    TICKET: "টিকিট (Tickets)",
    OTHER: "অন্যান্য খরচ (Expense)",
  };
  return defaultTitles[category];
}

/**
 * Builds a fallback or deterministic ParsedExpenseDraft for a single input line.
 * Performs completeness checks, settlement detection, and ambiguity questioning.
 */
export function buildFallbackItemForLine(args: {
  line: string;
  lineIndex: number;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
  source?: "deterministic" | "fallback";
}): ParsedExpenseDraft {
  const { line, lineIndex, members, currentMemberId, source = "fallback" } = args;
  const currentMember =
    members.find((m) => m.id === currentMemberId) ?? members[0]!;

  const amount = extractAmountFromText(line);
  const category = detectExpenseCategory(line);
  const { paidByMember, participantIds } = extractPayerAndParticipants({
    text: line,
    members,
    currentMemberId,
  });

  // Check for settlement patterns in Banglish / Bangla
  // e.g. "Sumi ke 500 dilam", "gave 500 to Karim", "tanvir ke 300 dise"
  let isSettlement = false;
  let receiverMember: MemberInput | null = null;
  const settlementMatch = line.match(
    /\b([A-Za-z]+|[\u0980-\u09FF]+)\s*(?:ke\b|কে)\s*(\d+|[০-৯]+)?\s*(?:dilam|disi|dilo|dise|দিলাম|দিছি|দিল|দিলো|gave|send|sent|transfer|ট্রান্সফার)/i,
  );
  if (settlementMatch && settlementMatch[1]) {
    receiverMember = matchTripMemberByName(
      settlementMatch[1],
      members,
      currentMemberId,
    );
    if (receiverMember) {
      isSettlement = true;
    }
  }

  let finalPayer = paidByMember;
  if (isSettlement && receiverMember) {
    if (finalPayer.id === receiverMember.id) {
      finalPayer = currentMember;
    }
  }

  let question: string | null = null;
  let confidence: "high" | "medium" | "low" = "high";
  let needsAttention = false;

  // Ambiguous quantity check: "ticket 2 ta 600"
  const ambiguousQtyMatch = line.match(
    /\b(\d+|[০-৯]+)\s*(?:ta|টা|টি|jon|জন|piece|pc|copies)\s+(\d+|[০-৯]+)\b/i,
  );
  if (ambiguousQtyMatch && ambiguousQtyMatch[1] && ambiguousQtyMatch[2]) {
    const qty = ambiguousQtyMatch[1];
    const moneyVal = ambiguousQtyMatch[2];
    question = `${moneyVal} টাকা কি প্রতিটির নাকি মোট (${qty} টির)?`;
    confidence = "medium";
    needsAttention = true;
  }

  // Check if a person name is mentioned who is NOT in the trip
  const recipientTargetMatch = line.match(
    /\b([A-Z][a-z]+|[\u0980-\u09FF]{2,})\s*(?:ke\b|কে)/i,
  );
  if (recipientTargetMatch && recipientTargetMatch[1]) {
    const targetName = recipientTargetMatch[1];
    const isSpecial =
      /^(ami|amar|shobai|sobai|সবাই|আমি|আমার|কারো|karo|ticket|tickets|টিকেট|টিকিট)$/i.test(
        targetName,
      );
    if (!isSpecial) {
      const targetMember = matchTripMemberByName(
        targetName,
        members,
        currentMemberId,
      );
      if (!targetMember) {
        question = question ?? `"${targetName}" কি এই ট্রিপের সদস্য?`;
        confidence = "medium";
        needsAttention = true;
      }
    }
  }

  if (amount === null) {
    question = "টাকার পরিমাণ কত?";
    confidence = "low";
    needsAttention = true;
  }

  let routeFrom: string | null = null;
  let routeTo: string | null = null;
  const bnRouteMatch = line.match(
    /([\u0980-\u09FFa-zA-Z']+)\s+থেকে\s+([\u0980-\u09FFa-zA-Z']+)/i,
  );
  const enRouteMatch = line.match(/\b([a-zA-Z']+)\s+to\s+([a-zA-Z']+)\b/i);
  if (bnRouteMatch?.[1] && bnRouteMatch?.[2]) {
    routeFrom = bnRouteMatch[1];
    routeTo = bnRouteMatch[2];
  } else if (enRouteMatch?.[1] && enRouteMatch?.[2]) {
    routeFrom = enRouteMatch[1];
    routeTo = enRouteMatch[2];
  }

  const cleanTitle = extractCleanTitle(line, members, category);
  const finalTitle = isSettlement && receiverMember
    ? `${receiverMember.displayName} কে লেনদেন`
    : cleanTitle || line.slice(0, 100);

  return parsedExpenseDraftSchema.parse({
    lineIndex,
    title: finalTitle,
    amount,
    category: isSettlement ? "OTHER" : category,
    paidByMemberId: finalPayer.id,
    paidByMatchedName: finalPayer.displayName,
    participantMemberIds:
      isSettlement && receiverMember ? [receiverMember.id] : participantIds,
    splitType: "EQUAL",
    note: null,
    rawInput: line.slice(0, 500),
    routeFrom,
    routeTo,
    placeName: null,
    confidence,
    parserSource: source,
    isSettlement,
    receiverMemberId: receiverMember?.id ?? null,
    receiverMatchedName: receiverMember?.displayName ?? null,
    question,
    needsAttention,
  });
}

/**
 * Parses all lines deterministically.
 */
export function parseExpensesDeterministicMulti(args: {
  rawText: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): ParsedExpenseDraft[] {
  const lines = getNormalizedLines(args.rawText);
  return lines.map((line, index) =>
    buildFallbackItemForLine({
      line,
      lineIndex: index,
      members: args.members,
      currentMemberId: args.currentMemberId,
      source: "deterministic",
    }),
  );
}

/**
 * Deterministic parser for single line inputs (retains backward compatibility with eval fixtures).
 */
export function parseExpenseDeterministic(args: {
  rawText: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): ParsedExpenseDraft {
  const trimmed = args.rawText.trim();
  if (!trimmed) {
    throw new NormalizeInputError("empty_input");
  }

  const lines = getNormalizedLines(args.rawText);
  return buildFallbackItemForLine({
    line: lines[0] ?? trimmed,
    lineIndex: 0,
    members: args.members,
    currentMemberId: args.currentMemberId,
    source: "deterministic",
  });
}

export interface ParseExpenseResult {
  items: ParsedExpenseDraft[];
  source: "llm" | "fallback";
}

function parseLlmJsonOutput(
  json: unknown,
): z.infer<typeof rawLlmExpenseItemSchema>[] | null {
  if (Array.isArray(json)) {
    const parsed = z.array(rawLlmExpenseItemSchema).safeParse(json);
    return parsed.success ? parsed.data : null;
  }
  const objParsed = rawLlmExpenseResponseSchema.safeParse(json);
  if (objParsed.success) {
    return objParsed.data.items;
  }
  const singleParsed = rawLlmExpenseItemSchema.safeParse(json);
  if (singleParsed.success) {
    return [singleParsed.data];
  }
  return null;
}

/**
 * Parses multi-line expense text with AI (Gemini) in a single request.
 * Enforces completeness check, fallback for failed/missing lines, and 15s timeout.
 */
export async function parseExpenseTextWithAI(args: {
  rawText: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): Promise<ParseExpenseResult> {
  const lines = getNormalizedLines(args.rawText);
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  // If no API key, use local deterministic multi-line fallback immediately
  if (!geminiKey) {
    return {
      items: parseExpensesDeterministicMulti(args),
      source: "fallback",
    };
  }

  try {
    const memberNamesList = args.members.map((m) => m.displayName).join(", ");
    const currentMember = args.members.find(
      (m) => m.id === args.currentMemberId,
    );

    const prompt = [
      "You are an expert Bangladeshi group trip expense and settlement parser.",
      "Extract structured JSON for the expenses or settlements in the numbered lines below.",
      `Trip members: [${memberNamesList}].`,
      `Current signed-in member (for 'আমি'/'ami'/'I'/'me'): ${currentMember?.displayName ?? "unknown"}.`,
      "",
      "Rules:",
      "1. Each numbered line is one expense or settlement. Return items in order. lineIndex is 0-based corresponding to line 1 = 0, line 2 = 1, etc. Set title to the clean item description WITHOUT repeating the price/amount number (e.g. for 'Shokaler nasta 250', title is 'Shokaler nasta', amount is 250).",
      "2. A line may produce more than one item only if it clearly contains several distinct expenses.",
      "3. If a line is a money transfer/settlement between members (e.g. 'Sumi ke 500 dilam', 'gave 500 to Karim'), set isSettlement: true, payerName to the giver, receiverName to recipient, category: 'OTHER', title: descriptive title.",
      "4. If a line names a person who is NOT in the trip members list, set question: 'Is [Name] in the trip?', confidence: 'medium', needsAttention: true.",
      "5. If a line has ambiguous quantity like 'ticket 2 ta 600' where 600 could be each or total, set question: 'Is 600 each or total?', confidence: 'medium', needsAttention: true.",
      "6. If a line has no amount (e.g. 'tickets'), set amount: null, question: 'What was the amount?', confidence: 'low', needsAttention: true.",
      "7. If payer is not mentioned, payerName should be null (will default to current member). If participants are not mentioned or it says 'সবাই'/'everyone'/'shobai', set isEveryone: true.",
      "8. Category must be one of: FOOD, TRANSPORT, HOTEL, TICKET, OTHER.",
      "9. Return ONLY a valid JSON object matching this schema:",
      '{"items": [{"lineIndex": number, "title": string, "amount": integer|null, "category": "TRANSPORT"|"HOTEL"|"FOOD"|"TICKET"|"OTHER", "payerName": string|null, "participantNames": string[], "isEveryone": boolean, "isSettlement": boolean, "receiverName": string|null, "routeFrom": string|null, "routeTo": string|null, "placeName": string|null, "confidence": "high"|"medium"|"low", "question": string|null, "needsAttention": boolean}]}',
      "",
      "Input lines:",
      ...lines.map((l, i) => `${i + 1}. ${l}`),
    ].join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      return {
        items: parseExpensesDeterministicMulti(args),
        source: "fallback",
      };
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const rawJsonText =
      payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawJsonText) {
      return {
        items: parseExpensesDeterministicMulti(args),
        source: "fallback",
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJsonText);
    } catch {
      return {
        items: parseExpensesDeterministicMulti(args),
        source: "fallback",
      };
    }

    const rawItems = parseLlmJsonOutput(parsedJson);
    if (!rawItems || rawItems.length === 0) {
      return {
        items: parseExpensesDeterministicMulti(args),
        source: "fallback",
      };
    }

    const processedItems: ParsedExpenseDraft[] = [];

    for (const rawItem of rawItems) {
      const lineIdx =
        typeof rawItem.lineIndex === "number" &&
        rawItem.lineIndex >= 0 &&
        rawItem.lineIndex < lines.length
          ? rawItem.lineIndex
          : 0;
      const associatedLine = lines[lineIdx] ?? lines[0] ?? "";

      const matchedPayer = rawItem.payerName
        ? matchTripMemberByName(
            rawItem.payerName,
            args.members,
            args.currentMemberId,
          )
        : null;

      const finalPayer =
        matchedPayer ??
        args.members.find((m) => m.id === args.currentMemberId) ??
        args.members[0]!;

      let finalParticipantIds: string[] = [];
      if (rawItem.isEveryone) {
        finalParticipantIds = args.members.map((m) => m.id);
      } else if (
        rawItem.participantNames &&
        rawItem.participantNames.length > 0
      ) {
        for (const name of rawItem.participantNames) {
          const m = matchTripMemberByName(
            name,
            args.members,
            args.currentMemberId,
          );
          if (m && !finalParticipantIds.includes(m.id)) {
            finalParticipantIds.push(m.id);
          }
        }
      }

      if (finalParticipantIds.length === 0) {
        finalParticipantIds = args.members.map((m) => m.id);
      }

      const matchedReceiver = rawItem.receiverName
        ? matchTripMemberByName(
            rawItem.receiverName,
            args.members,
            args.currentMemberId,
          )
        : null;

      const hasMissingAmount =
        rawItem.amount === null ||
        rawItem.amount === undefined ||
        rawItem.amount <= 0;
      const finalAmount = hasMissingAmount ? null : rawItem.amount;

      let finalQuestion = rawItem.question ?? null;
      if (finalAmount === null && !finalQuestion) {
        finalQuestion = "টাকার পরিমাণ কত?";
      }

      const isNeedsAttention =
        Boolean(rawItem.needsAttention) ||
        finalAmount === null ||
        Boolean(finalQuestion) ||
        rawItem.confidence === "low" ||
        rawItem.confidence === "medium";

      let resolvedTitle = (rawItem.title || associatedLine.slice(0, 100)).trim();
      if (finalAmount && resolvedTitle.length > 2) {
        const amtStr = String(finalAmount);
        const withoutAmt = resolvedTitle
          .replace(
            new RegExp(`(?:^|\\s)${amtStr}(?:\\s|tk|taka|টাকা|\\/-)?$`, "i"),
            "",
          )
          .trim();
        if (withoutAmt.length >= 2) {
          resolvedTitle = withoutAmt;
        }
      }

      const draft = parsedExpenseDraftSchema.parse({
        lineIndex: lineIdx,
        title: resolvedTitle,
        amount: finalAmount,
        category: rawItem.category ?? "OTHER",
        paidByMemberId: finalPayer.id,
        paidByMatchedName: finalPayer.displayName,
        participantMemberIds:
          rawItem.isSettlement && matchedReceiver
            ? [matchedReceiver.id]
            : finalParticipantIds,
        splitType: "EQUAL",
        note: null,
        rawInput: associatedLine.slice(0, 500),
        routeFrom: rawItem.routeFrom ?? null,
        routeTo: rawItem.routeTo ?? null,
        placeName: rawItem.placeName ?? null,
        confidence: rawItem.confidence ?? "high",
        parserSource: "llm",
        isSettlement: Boolean(rawItem.isSettlement),
        receiverMemberId: matchedReceiver?.id ?? null,
        receiverMatchedName: matchedReceiver?.displayName ?? null,
        question: finalQuestion,
        needsAttention: isNeedsAttention,
      });

      processedItems.push(draft);
    }

    // Step 3: Completeness check in code
    // For every input line that produced no item, create a fallback row from that line
    const coveredLineIndices = new Set(processedItems.map((it) => it.lineIndex));
    for (let i = 0; i < lines.length; i++) {
      if (!coveredLineIndices.has(i)) {
        const fallbackItem = buildFallbackItemForLine({
          line: lines[i]!,
          lineIndex: i,
          members: args.members,
          currentMemberId: args.currentMemberId,
          source: "fallback",
        });
        fallbackItem.needsAttention = true;
        fallbackItem.confidence = "low";
        processedItems.push(fallbackItem);
      }
    }

    // Sort items by lineIndex in ascending order
    processedItems.sort((a, b) => a.lineIndex - b.lineIndex);

    return {
      items: processedItems,
      source: "llm",
    };
  } catch {
    return {
      items: parseExpensesDeterministicMulti(args),
      source: "fallback",
    };
  }
}
