<USER_REQUEST>
#!/usr/bin/env bash
set -euo pipefail

if [ -f "./package.json" ] && [ -d "./src" ]; then
  PROJECT_DIR="."
elif [ -d "./trip-hub" ]; then
  PROJECT_DIR="./trip-hub"
else
  echo "ERROR: Run step6.sh either inside trip-hub/ or from its parent directory." >&2
  exit 1
fi

echo "==> Applying Step 6 (AI Expense Parser, Confirm Card, Rate Limits & 25-Sentence Benchmark) to ${PROJECT_DIR} ..."
mkdir -p \
  "${PROJECT_DIR}/docs" \
  "${PROJECT_DIR}/src/lib/__tests__/fixtures" \
  "${PROJECT_DIR}/src/app/api/trips/[slug]/parse-expense" \
  "${PROJECT_DIR}/src/components" \
  "${PROJECT_DIR}/src/messages" \
  "${PROJECT_DIR}/src/app/trips/[slug]"

cat > "${PROJECT_DIR}/src/lib/rate-limit.ts" <<'EOF'
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason?: "trip_limit" | "ip_limit";
  remainingTripQuota: number;
  remainingIpQuota: number;
}

export interface RateLimitConfig {
  tripMaxRequests: number;
  tripWindowMs: number;
  ipMaxRequests: number;
  ipWindowMs: number;
}

export const DEFAULT_PARSER_RATE_LIMIT: RateLimitConfig = {
  tripMaxRequests: 25,
  tripWindowMs: 10 * 60 * 1000, // 25 requests per 10 minutes per trip
  ipMaxRequests: 15,
  ipWindowMs: 5 * 60 * 1000, // 15 requests per 5 minutes per IP
};

export class SlidingWindowRateLimiter {
  private readonly tripHits = new Map<string, number[]>();
  private readonly ipHits = new Map<string, number[]>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig = DEFAULT_PARSER_RATE_LIMIT) {
    this.config = config;
  }

  private pruneWindow(timestamps: number[], cutoffMs: number): number[] {
    return timestamps.filter((t) => t > cutoffMs);
  }

  public checkAndRecord(args: {
    tripId: string;
    ip: string;
    nowMs?: number;
  }): RateLimitResult {
    const now = args.nowMs ?? Date.now();
    const tripKey = args.tripId.trim() || "unknown_trip";
    const ipKey = args.ip.trim() || "unknown_ip";

    const tripCutoff = now - this.config.tripWindowMs;
    const ipCutoff = now - this.config.ipWindowMs;

    const recentTripHits = this.pruneWindow(
      this.tripHits.get(tripKey) ?? [],
      tripCutoff,
    );
    const recentIpHits = this.pruneWindow(
      this.ipHits.get(ipKey) ?? [],
      ipCutoff,
    );

    if (recentIpHits.length >= this.config.ipMaxRequests) {
      const oldestIpHit = recentIpHits[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestIpHit + this.config.ipWindowMs - now) / 1000),
      );
      this.ipHits.set(ipKey, recentIpHits);
      this.tripHits.set(tripKey, recentTripHits);
      return {
        allowed: false,
        retryAfterSeconds,
        reason: "ip_limit",
        remainingTripQuota: Math.max(
          0,
          this.config.tripMaxRequests - recentTripHits.length,
        ),
        remainingIpQuota: 0,
      };
    }

    if (recentTripHits.length >= this.config.tripMaxRequests) {
      const oldestTripHit = recentTripHits[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestTripHit + this.config.tripWindowMs - now) / 1000),
      );
      this.ipHits.set(ipKey, recentIpHits);
      this.tripHits.set(tripKey, recentTripHits);
      return {
        allowed: false,
        retryAfterSeconds,
        reason: "trip_limit",
        remainingTripQuota: 0,
        remainingIpQuota: Math.max(
          0,
          this.config.ipMaxRequests - recentIpHits.length,
        ),
      };
    }

    recentTripHits.push(now);
    recentIpHits.push(now);
    this.tripHits.set(tripKey, recentTripHits);
    this.ipHits.set(ipKey, recentIpHits);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingTripQuota: Math.max(
        0,
        this.config.tripMaxRequests - recentTripHits.length,
      ),
      remainingIpQuota: Math.max(
        0,
        this.config.ipMaxRequests - recentIpHits.length,
      ),
    };
  }

  public reset(): void {
    this.tripHits.clear();
    this.ipHits.clear();
  }
}

export const parserRateLimiter = new SlidingWindowRateLimiter();
EOF

cat > "${PROJECT_DIR}/src/lib/ai-parser.ts" <<'EOF'
import { z } from "zod";
import { banglaToAsciiDigits, normalizeNameKey } from "@/lib/crypto";
import type { ExpenseCategoryValue, MemberInput } from "@/lib/money";
import { EXPENSE_CATEGORIES, SPLIT_TYPES } from "@/lib/trips";

/**
 * Strict Zod schema for validating AI / parser output before showing the Confirm Card.
 */
export const parsedExpenseDraftSchema = z.object({
  title: z.string().trim().min(1).max(100),
  amount: z.number().int().positive().max(10_000_000),
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
  parserSource: z.enum(["llm", "deterministic"]).default("deterministic"),
});

export type ParsedExpenseDraft = z.infer<typeof parsedExpenseDraftSchema>;

/**
 * Schema for raw LLM JSON responses before member IDs are resolved against trip.members.
 */
export const rawLlmExpenseJsonSchema = z.object({
  title: z.string().trim().min(1).max(100),
  amount: z.number().int().positive().max(10_000_000),
  category: z.enum(EXPENSE_CATEGORIES),
  payerName: z.string().trim().nullable().optional(),
  participantNames: z.array(z.string().trim()).optional(),
  isEveryone: z.boolean().optional(),
  routeFrom: z.string().trim().max(80).nullable().optional(),
  routeTo: z.string().trim().max(80).nullable().optional(),
  placeName: z.string().trim().max(80).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
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
  if (
    currentMemberId &&
    /^(আমি|আমার|ami|amar|me|i|myself)$/i.test(norm)
  ) {
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
      /(টিকিট|টিকেট|ticket|tickets|এন্ট্রি|entry\s*fee|পাস|জাদুঘর|পার্ক\s*ফি|সফারি)/i,
  },
  {
    category: "TRANSPORT",
    pattern:
      /(বাস|ট্রেন|লঞ্চ|সিএনজি|অটো|রিকশা|ট্যাক্সি|উবার|পাঠাও|বোট|নৌকা|ট্রলার|জীপ|জিপ|চাঁদের\s*গাড়ি|ভাড়া|গাড়ি|ফ্লাইট|বিমান|ফেরি|স্পিডবোট|bus|train|launch|cng|auto|rickshaw|uber|pathao|boat|trawler|jeep|chander\s*gari|fare|bhara|vara|transport|flight|ferry|speedboat)/i,
  },
  {
    category: "HOTEL",
    pattern:
      /(হোটেল|রিসোর্ট|কটেজ|রুম|চেক-ইন|চেকইন|থাকা|ক্যাম্পিং|তাঁবু|hotel|resort|cottage|room|stay|check-in|checkin|tent|villa|motel)/i,
  },
  {
    category: "FOOD",
    pattern:
      /(খাবার|নাস্তা|লাঞ্চ|ডিনার|ব্রেকফাস্ট|দুপুরের\s*খাবার|রাতের\s*খাবার|সকালের\s*নাস্তা|বিরিয়ানি|কাচ্চি|ভাত|মাছ|সিফুড|বারবিকিউ|চা|কফি|পানি|জুস|স্ন্যাকস|রেস্টুরেন্ট|ডাব|ফুচকা|food|breakfast|lunch|dinner|snacks|tea|cha|coffee|biryani|kacchi|seafood|bbq|barbecue|water|restaurant|meal|drink|dab)/i,
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

export function parseExpenseDeterministic(args: {
  rawText: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): ParsedExpenseDraft {
  const trimmed = args.rawText.trim();
  if (!trimmed) {
    throw new Error("empty_input");
  }

  const amount = extractAmountFromText(trimmed);
  if (!amount) {
    throw new Error("missing_amount");
  }

  const category = detectExpenseCategory(trimmed);
  const { paidByMember, participantIds } = extractPayerAndParticipants({
    text: trimmed,
    members: args.members,
    currentMemberId: args.currentMemberId,
  });

  const title = extractCleanTitle(trimmed, args.members, category);

  let routeFrom: string | null = null;
  let routeTo: string | null = null;
  const bnRouteMatch = trimmed.match(
    /([ঀ-a-zA-Z']+)\s+থেকে\s+([ঀ-a-zA-Z']+)/i,
  );
  const enRouteMatch = trimmed.match(
    /\b([a-zA-Z']+)\s+to\s+([a-zA-Z']+)\b/i,
  );
  if (bnRouteMatch?.[1] && bnRouteMatch?.[2]) {
    routeFrom = bnRouteMatch[1];
    routeTo = bnRouteMatch[2];
  } else if (enRouteMatch?.[1] && enRouteMatch?.[2]) {
    routeFrom = enRouteMatch[1];
    routeTo = enRouteMatch[2];
  }

  return parsedExpenseDraftSchema.parse({
    title,
    amount,
    category,
    paidByMemberId: paidByMember.id,
    paidByMatchedName: paidByMember.displayName,
    participantMemberIds: participantIds,
    splitType: "EQUAL",
    note: null,
    rawInput: trimmed,
    routeFrom,
    routeTo,
    placeName: null,
    confidence: "high",
    parserSource: "deterministic",
  });
}

export async function parseExpenseTextWithAI(args: {
  rawText: string;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): Promise<ParsedExpenseDraft> {
  const deterministicDraft = parseExpenseDeterministic(args);
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (!geminiKey) {
    return deterministicDraft;
  }

  try {
    const memberNamesList = args.members.map((m) => m.displayName).join(", ");
    const currentMember = args.members.find(
      (m) => m.id === args.currentMemberId,
    );

    const prompt = [
      "You are a Bangladeshi group trip expense parser. Extract structured JSON from the user's Bangla, Banglish, or English expense text.",
      `Trip members: [${memberNamesList}].`,
      `Current signed-in member (for 'আমি'/'ami'/'I'): ${currentMember?.displayName ?? "unknown"}.`,
      "Return ONLY a valid JSON object matching this exact schema:",
      '{"title": string, "amount": positive integer in whole BDT, "category": "TRANSPORT"|"HOTEL"|"FOOD"|"TICKET"|"OTHER", "payerName": string|null, "participantNames": string[], "isEveryone": boolean, "routeFrom": string|null, "routeTo": string|null, "placeName": string|null, "confidence": "high"|"medium"|"low"}',
      `User input: ${JSON.stringify(args.rawText)}`,
    ].join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
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
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      return deterministicDraft;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const rawJsonText =
      payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawJsonText) {
      return deterministicDraft;
    }

    const llmParsed = rawLlmExpenseJsonSchema.safeParse(
      JSON.parse(rawJsonText),
    );
    if (!llmParsed.success) {
      return deterministicDraft;
    }

    const data = llmParsed.data;
    const matchedPayer = data.payerName
      ? matchTripMemberByName(
          data.payerName,
          args.members,
          args.currentMemberId,
        )
      : null;

    const finalPayer =
      matchedPayer ??
      args.members.find((m) => m.id === deterministicDraft.paidByMemberId) ??
      args.members[0]!;

    let finalParticipantIds: string[] = [];
    if (data.isEveryone) {
      finalParticipantIds = args.members.map((m) => m.id);
    } else if (data.participantNames && data.participantNames.length > 0) {
      for (const name of data.participantNames) {
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
      finalParticipantIds = deterministicDraft.participantMemberIds;
    }

    return parsedExpenseDraftSchema.parse({
      title: data.title,
      amount: data.amount,
      category: data.category,
      paidByMemberId: finalPayer.id,
      paidByMatchedName: finalPayer.displayName,
      participantMemberIds: finalParticipantIds,
      splitType: "EQUAL",
      note: null,
      rawInput: args.rawText.trim(),
      routeFrom: data.routeFrom ?? deterministicDraft.routeFrom,
      routeTo: data.routeTo ?? deterministicDraft.routeTo,
      placeName: data.placeName ?? null,
      confidence: data.confidence ?? "high",
      parserSource: "llm",
    });
  } catch {
    return deterministicDraft;
  }
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
EOF

cat > "${PROJECT_DIR}/src/lib/__tests__/fixtures/bangla-banglish-25.json" <<'EOF'
[
  {
    "id": 1,
    "input": "রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই",
    "currentMemberId": "karim",
    "expected": {
      "amount": 1200,
      "category": "FOOD",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 2,
    "input": "সিএনজি ভাড়া ৪৫০ টাকা তানভীর দিয়েছে শুধু করিম, সুমি আর তানভীর",
    "currentMemberId": "karim",
    "expected": {
      "amount": 450,
      "category": "TRANSPORT",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["karim", "sumi", "tanvir"]
    }
  },
  {
    "id": 3,
    "input": "হোটেল রিসোর্ট বিল ৫০০০ টাকা সুমি দিয়েছে সবার জন্য",
    "currentMemberId": "karim",
    "expected": {
      "amount": 5000,
      "category": "HOTEL",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 4,
    "input": "বাসের টিকিট ২৫০০ টাকা আমি দিয়েছি সবাই",
    "currentMemberId": "karim",
    "expected": {
      "amount": 2500,
      "category": "TICKET",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 5,
    "input": "সকালের নাস্তা ও চা ৩৫০ টাকা নাবিলা দিয়েছে",
    "currentMemberId": "karim",
    "expected": {
      "amount": 350,
      "category": "FOOD",
      "paidByMemberId": "nabila",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 6,
    "input": "নৌকা ভাড়া দেড় হাজার টাকা করিম দিয়েছে",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 1500,
      "category": "TRANSPORT",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 7,
    "input": "করিম আর তানভীরের চা ১২০ টাকা তানভীর দিয়েছে",
    "currentMemberId": "karim",
    "expected": {
      "amount": 120,
      "category": "FOOD",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["karim", "tanvir"]
    }
  },
  {
    "id": 8,
    "input": "এন্ট্রি টিকিট ৫০০ টাকা সুমি দিছে সবাই",
    "currentMemberId": "tanvir",
    "expected": {
      "amount": 500,
      "category": "TICKET",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 9,
    "input": "চাঁদের গাড়ি ভাড়া আড়াই হাজার টাকা মামুন দিয়েছে",
    "currentMemberId": "karim",
    "expected": {
      "amount": 2500,
      "category": "TRANSPORT",
      "paidByMemberId": "mamun",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 10,
    "input": "দুপুরের কাচ্চি বিরিয়ানি ১৮০০ টাকা করিম বিল দিয়েছে",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 1800,
      "category": "FOOD",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 11,
    "input": "কটেজ বুকিং ৩০০০ টাকা আমি বিল দিয়েছি",
    "currentMemberId": "nabila",
    "expected": {
      "amount": 3000,
      "category": "HOTEL",
      "paidByMemberId": "nabila",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 12,
    "input": "ডাব ও পানি ২০০ টাকা শুধু সুমি আর নাবিলা, সুমি দিয়েছে",
    "currentMemberId": "karim",
    "expected": {
      "amount": 200,
      "category": "FOOD",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["sumi", "nabila"]
    }
  },
  {
    "id": 13,
    "input": "Seafood dinner 2200 tk Karim paid shobai",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 2200,
      "category": "FOOD",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 14,
    "input": "CNG bhara 300 tk Tanvir dilo for Karim, Tanvir and Mamun",
    "currentMemberId": "karim",
    "expected": {
      "amount": 300,
      "category": "TRANSPORT",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["karim", "tanvir", "mamun"]
    }
  },
  {
    "id": 15,
    "input": "Hotel room advance 4000 taka Sumi dise everyone",
    "currentMemberId": "karim",
    "expected": {
      "amount": 4000,
      "category": "HOTEL",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 16,
    "input": "Launch ticket 1600 tk ami disi shobar jonno",
    "currentMemberId": "tanvir",
    "expected": {
      "amount": 1600,
      "category": "TICKET",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 17,
    "input": "Breakfast পরোটা ও ডিম 400 tk Nabila paid",
    "currentMemberId": "karim",
    "expected": {
      "amount": 400,
      "category": "FOOD",
      "paidByMemberId": "nabila",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 18,
    "input": "Speedboat vara 1200 bdt Korim dilo for Korim and Sumi",
    "currentMemberId": "tanvir",
    "expected": {
      "amount": 1200,
      "category": "TRANSPORT",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi"]
    }
  },
  {
    "id": 19,
    "input": "BBQ night 1500 tk Mamun paid for everyone",
    "currentMemberId": "karim",
    "expected": {
      "amount": 1500,
      "category": "FOOD",
      "paidByMemberId": "mamun",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 20,
    "input": "Train ticket Dhaka to Sreemangal 1800 tk Karim paid",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 1800,
      "category": "TICKET",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 21,
    "input": "Rickshaw fare 150 tk Shumi dilo only Shumi and Nabila",
    "currentMemberId": "karim",
    "expected": {
      "amount": 150,
      "category": "TRANSPORT",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["sumi", "nabila"]
    }
  },
  {
    "id": 22,
    "input": "Resort check-in 6000 tk paid by Tanbir",
    "currentMemberId": "karim",
    "expected": {
      "amount": 6000,
      "category": "HOTEL",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 23,
    "input": "কফি ও স্ন্যাকস ৬০০ টাকা তানভীর পে করেছে শুধু তানভীর, নাবিলা ও মামুন",
    "currentMemberId": "karim",
    "expected": {
      "amount": 600,
      "category": "FOOD",
      "paidByMemberId": "tanvir",
      "participantMemberIds": ["tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 24,
    "input": "টর্চলাইট ও ব্যাটারি ৩০০ টাকা করিম দিয়েছে",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 300,
      "category": "OTHER",
      "paidByMemberId": "karim",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  },
  {
    "id": 25,
    "input": "Mosquito coil and first aid 250 tk I paid for everyone",
    "currentMemberId": "sumi",
    "expected": {
      "amount": 250,
      "category": "OTHER",
      "paidByMemberId": "sumi",
      "participantMemberIds": ["karim", "sumi", "tanvir", "nabila", "mamun"]
    }
  }
]
EOF

cat > "${PROJECT_DIR}/src/lib/__tests__/step6-ai-parser.test.ts" <<'EOF'
import { describe, expect, it } from "vitest";
import fixture25 from "@/lib/__tests__/fixtures/bangla-banglish-25.json";
import {
  matchTripMemberByName,
   parsedExpenseDraftSchema,
  parseExpenseDeterministic,
} from "@/lib/ai-parser";
import type { MemberInput } from "@/lib/money";
import { SlidingWindowRateLimiter } from "@/lib/rate-limit";

const BENCHMARK_MEMBERS: MemberInput[] = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
  { id: "nabila", displayName: "Nabila", emoji: "📸", isGuest: false },
  { id: "mamun", displayName: "Mamun (Guest)", emoji: "👤", isGuest: true },
];

describe("matchTripMemberByName — Bangla, Banglish & pronoun resolution", () => {
  it("matches Bangla script names, Banglish variants, suffixes, and first-person pronouns", () => {
    expect(
      matchTripMemberByName("করিম", BENCHMARK_MEMBERS, "sumi")?.id,
    ).toBe("karim");
    expect(
      matchTripMemberByName("করিমের", BENCHMARK_MEMBERS, "sumi")?.id,
    ).toBe("karim");
    expect(
      matchTripMemberByName("Korim", BENCHMARK_MEMBERS, "sumi")?.id,
    ).toBe("karim");
    expect(
      matchTripMemberByName("Shumi", BENCHMARK_MEMBERS, "karim")?.id,
    ).toBe("sumi");
    expect(
      matchTripMemberByName("Tanbir", BENCHMARK_MEMBERS, "karim")?.id,
    ).toBe("tanvir");
    expect(
      matchTripMemberByName("মামুন", BENCHMARK_MEMBERS, "karim")?.id,
    ).toBe("mamun");
    expect(
      matchTripMemberByName("আমি", BENCHMARK_MEMBERS, "nabila")?.id,
    ).toBe("nabila");
    expect(
      matchTripMemberByName("ami", BENCHMARK_MEMBERS, "tanvir")?.id,
    ).toBe("tanvir");
  });
});

describe("25-sentence Bangla + Banglish parser benchmark evaluation", () => {
  it("scores 25/25 (100%) across amount, category, payer, participants, and Zod schema validation", () => {
    expect(fixture25).toHaveLength(25);

    let passedCount = 0;
    const failures: string[] = [];

    for (const item of fixture25) {
      const draft = parseExpenseDeterministic({
        rawText: item.input,
        members: BENCHMARK_MEMBERS,
        currentMemberId: item.currentMemberId,
      });

      const zodCheck = parsedExpenseDraftSchema.safeParse(draft);
      const amountMatch = draft.amount === item.expected.amount;
      const categoryMatch = draft.category === item.expected.category;
      const payerMatch = draft.paidByMemberId === item.expected.paidByMemberId;
      const actualParticipants = [...draft.participantMemberIds].sort().join(",");
      const expectedParticipants = [...item.expected.participantMemberIds]
        .sort()
        .join(",");
      const participantsMatch = actualParticipants === expectedParticipants;

      if (
        zodCheck.success &&
        amountMatch &&
        categoryMatch &&
        payerMatch &&
        participantsMatch
      ) {
        passedCount++;
      } else {
        failures.push(
          `#${item.id} ("${item.input}"): got amount=${draft.amount}, cat=${draft.category}, payer=${draft.paidByMemberId}, parts=[${actualParticipants}]`,
        );
      }
    }

    expect(failures).toEqual([]);
    expect(passedCount).toBe(25);
  });
});

describe("SlidingWindowRateLimiter — per-trip and per-IP rate limiting", () => {
  it("blocks when IP exceeds ipMaxRequests and recovers after window expires", () => {
    const limiter = new SlidingWindowRateLimiter({
      tripMaxRequests: 10,
      tripWindowMs: 60_000,
      ipMaxRequests: 3,
      ipWindowMs: 10_000,
    });

    const t0 = 1_000_000;
    expect(
      limiter.checkAndRecord({ tripId: "trip-1", ip: "203.0.113.5", nowMs: t0 })
        .allowed,
    ).toBe(true);
    expect(
      limiter.checkAndRecord({
        tripId: "trip-1",
        ip: "203.0.113.5",
        nowMs: t0 + 1000,
      }).allowed,
    ).toBe(true);
    expect(
      limiter.checkAndRecord({
        tripId: "trip-1",
        ip: "203.0.113.5",
        nowMs: t0 + 2000,
      }).allowed,
    ).toBe(true);

    // 4th request from same IP within 10s is blocked with reason = "ip_limit"
    const blockedIp = limiter.checkAndRecord({
      tripId: "trip-1",
      ip: "203.0.113.5",
      nowMs: t0 + 3000,
    });
    expect(blockedIp.allowed).toBe(false);
    expect(blockedIp.reason).toBe("ip_limit");
    expect(blockedIp.retryAfterSeconds).toBeGreaterThan(0);

    // After 10.1s window passes, IP is allowed again
    expect(
      limiter.checkAndRecord({
        tripId: "trip-1",
        ip: "203.0.113.5",
        nowMs: t0 + 10_500,
      }).allowed,
    ).toBe(true);
  });

  it("blocks when a trip exceeds tripMaxRequests across multiple IPs", () => {
    const limiter = new SlidingWindowRateLimiter({
      tripMaxRequests: 2,
      tripWindowMs: 60_000,
      ipMaxRequests: 10,
      ipWindowMs: 60_000,
    });

    const t0 = 2_000_000;
    expect(
      limiter.checkAndRecord({ tripId: "trip-a", ip: "10.0.0.1", nowMs: t0 })
        .allowed,
    ).toBe(true);
    expect(
      limiter.checkAndRecord({ tripId: "trip-a", ip: "10.0.0.2", nowMs: t0 })
        .allowed,
    ).toBe(true);

    const blockedTrip = limiter.checkAndRecord({
      tripId: "trip-a",
      ip: "10.0.0.3",
      nowMs: t0 + 500,
    });
    expect(blockedTrip.allowed).toBe(false);
    expect(blockedTrip.reason).toBe("trip_limit");
  });
});
EOF

cat > "${PROJECT_DIR}/src/app/api/trips/[slug]/parse-expense/route.ts" <<'EOF'
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseExpenseTextWithAI } from "@/lib/ai-parser";
import { db } from "@/lib/db";
import { parserRateLimiter } from "@/lib/rate-limit";
import { assertTripWritable } from "@/lib/safety";
import { getCurrentMemberForTrip } from "@/lib/session";

const parseRequestSchema = z.object({
  text: z.string().trim().min(2).max(500),
});

function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const parsedBody = parseRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const trip = await db.trip.findUnique({
    where: { slug },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "trip_not_found" },
      { status: 404 },
    );
  }

  try {
    assertTripWritable(trip);
  } catch {
    return NextResponse.json(
      { ok: false, error: "trip_locked" },
      { status: 403 },
    );
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // Enforce per-trip and per-IP sliding window rate limits
  const clientIp = extractClientIp(request);
  const rateCheck = parserRateLimiter.checkAndRecord({
    tripId: trip.id,
    ip: clientIp,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        reason: rateCheck.reason,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const draft = await parseExpenseTextWithAI({
      rawText: parsedBody.data.text,
      members: trip.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        emoji: m.emoji,
        isGuest: m.isGuest,
      })),
      currentMemberId: currentMember.id,
    });

    // Returns the parsed draft ONLY for the Confirm Card — never auto-saves to DB
    return NextResponse.json({ ok: true, draft }, { status: 200 });
  } catch (err) {
    const code =
      err instanceof Error && err.message === "missing_amount"
        ? "missing_amount"
        : "parse_failed";
    return NextResponse.json({ ok: false, error: code }, { status: 422 });
  }
}
EOF

cat > "${PROJECT_DIR}/src/components/AiExpenseParserCard.tsx" <<'EOF'
"use client";

import { useState } from "react";
import { saveExpenseAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import type { ExistingExpenseSummary } from "@/components/ExpenseFormCard";
import type { ParsedExpenseDraft } from "@/lib/ai-parser";
import type { ExpenseCategoryValue, MemberInput } from "@/lib/money";

export interface AiExpenseParserLabels {
  cardTitle: string;
  cardSubtitle: string;
  inputPlaceholder: string;
  tryExamplesLabel: string;
  parseButton: string;
  parsingButton: string;
  confirmCardBadge: string;
  confirmCardNote: string;
  rawInputLabel: string;
  titleLabel: string;
  amountLabel: string;
  categoryLabel: string;
  dateLabel: string;
  paidByLabel: string;
  participantsLabel: string;
  selectAll: string;
  confirmSaveButton: string;
  discardDraftButton: string;
  duplicateWarningTitle: string;
  duplicateWarningBody: string;
  confirmDuplicateLabel: string;
  errMissingAmount: string;
  errRateLimited: string;
  errGeneric: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface AiExpenseParserCardProps {
  slug: string;
  members: MemberInput[];
  defaultDateYyyyMmDd: string;
  existingExpenses: ExistingExpenseSummary[];
  labels: AiExpenseParserLabels;
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

export function AiExpenseParserCard({
  slug,
  members,
  defaultDateYyyyMmDd,
  existingExpenses,
  labels,
}: AiExpenseParserCardProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedExpenseDraft | null>(null);

  // Editable state inside the Confirm Card
  const [titleStr, setTitleStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [categoryVal, setCategoryVal] = useState<ExpenseCategoryValue>("FOOD");
  const [dateStr, setDateStr] = useState(defaultDateYyyyMmDd);
  const [paidByVal, setPaidByVal] = useState(members[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    members.map((m) => m.id),
  );

  const firstMemberName = members[0]?.displayName ?? "করিম";
  const secondMemberName = members[1]?.displayName ?? "সুমি";

  const samplePrompts = [
    `রাতের খাবার ১২০০ টাকা ${firstMemberName} দিয়েছে সবাই`,
    `CNG bhara 450 tk ${firstMemberName} paid for ${firstMemberName} and ${secondMemberName}`,
    `হোটেল বুকিং ৫০০০ টাকা আমি দিয়েছি সবার জন্য`,
  ];

  async function handleParse(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!rawText.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/trips/${slug}/parse-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        draft?: ParsedExpenseDraft;
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.ok || !data.draft) {
        if (res.status === 429 || data.error === "rate_limited") {
          setErrorMsg(
            `${labels.errRateLimited} (${data.retryAfterSeconds ?? 30}s)`,
          );
        } else if (data.error === "missing_amount") {
          setErrorMsg(labels.errMissingAmount);
        } else {
          setErrorMsg(labels.errGeneric);
        }
        return;
      }

      const d = data.draft;
      setDraft(d);
      setTitleStr(d.title);
      setAmountStr(String(d.amount));
      setCategoryVal(d.category);
      setDateStr(defaultDateYyyyMmDd);
      setPaidByVal(d.paidByMemberId);
      setSelectedIds(d.participantMemberIds);
    } catch {
      setErrorMsg(labels.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  function toggleParticipant(memberId: string): void {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  }

  const totalAmount = Math.trunc(toAsciiNumber(amountStr));
  const candidateNormTitle = normalizeTitle(titleStr);
  const matchingDuplicate =
    draft && totalAmount > 0
      ? existingExpenses.find((exp) => {
          if (exp.amount !== totalAmount) return false;
          if (exp.expenseDateYyyyMmDd !== dateStr) return false;
          const sameTitle =
            candidateNormTitle.length > 0 &&
            normalizeTitle(exp.title) === candidateNormTitle;
          const samePayerAndCat =
            exp.paidById === paidByVal && exp.category === categoryVal;
          return sameTitle || samePayerAndCat;
        }) ?? null
      : null;

  return (
    <div className="space-y-4 rounded-xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-primary)]">
          ✨ {labels.cardTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.cardSubtitle}
        </p>
      </div>

      {/* Step 6.1: Single text box accepting Bangla or Banglish */}
      <form onSubmit={handleParse} className="space-y-3">
        <textarea
          rows={2}
          required
          maxLength={500}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={labels.inputPlaceholder}
          className="w-full rounded-xl border border-[var(--color-border)] bg-white p-3 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"
        />

        {/* Quick example chips */}
        <div className="space-y-1">
          <span className="block text-xs font-semibold text-[var(--color-fg-muted)]">
            {labels.tryExamplesLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setRawText(sample)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-left text-xs text-[var(--color-fg)] hover:bg-[var(--color-border)]"
              >
                &ldquo;{sample}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {errorMsg ? (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
          >
            {errorMsg}
          </div>
        ) : null}

        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? labels.parsingButton : labels.parseButton}
        </Button>
      </form>

      {/* Step 6.4: Confirm Card before saving (NEVER auto-saves) */}
      {draft ? (
        <div className="space-y-4 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
            <div>
              <span className="inline-block rounded-md bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-bold text-white">
                {labels.confirmCardBadge}
              </span>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                {labels.confirmCardNote}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs font-semibold text-red-700 underline"
            >
              {labels.discardDraftButton}
            </button>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-fg-muted)]">
            <span className="font-semibold text-[var(--color-fg)]">
              {labels.rawInputLabel}
            </span>{" "}
            &ldquo;{draft.rawInput}&rdquo;
          </div>

          <form action={saveExpenseAction} className="space-y-3.5">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="splitType" value="EQUAL" />
            <input type="hidden" name="rawInput" value={draft.rawInput} />
            {draft.routeFrom ? (
              <input type="hidden" name="routeFrom" value={draft.routeFrom} />
            ) : null}
            {draft.routeTo ? (
              <input type="hidden" name="routeTo" value={draft.routeTo} />
            ) : null}
            {draft.placeName ? (
              <input type="hidden" name="placeName" value={draft.placeName} />
            ) : null}

            <div className="space-y-1">
              <label
                htmlFor="ai-title"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.titleLabel}
              </label>
              <input
                id="ai-title"
                name="title"
                type="text"
                required
                maxLength={100}
                value={titleStr}
                onChange={(e) => setTitleStr(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-semibold text-[var(--color-fg)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="ai-amount"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.amountLabel}
                </label>
                <input
                  id="ai-amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-bold text-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="ai-category"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.categoryLabel}
                </label>
                <select
                  id="ai-category"
                  name="category"
                  value={categoryVal}
                  onChange={(e) =>
                    setCategoryVal(e.target.value as ExpenseCategoryValue)
                  }
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-[var(--color-fg)]"
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
              <div className="space-y-1">
                <label
                  htmlFor="ai-date"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.dateLabel}
                </label>
                <input
                  id="ai-date"
                  name="expenseDate"
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-[var(--color-fg)]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="ai-paidBy"
                  className="block text-xs font-semibold text-[var(--color-fg)]"
                >
                  {labels.paidByLabel}
                </label>
                <select
                  id="ai-paidBy"
                  name="paidById"
                  value={paidByVal}
                  onChange={(e) => setPaidByVal(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm font-semibold text-[var(--color-fg)]"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.emoji ?? "🎒"} {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-fg)]">
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

              <div className="grid grid-cols-2 gap-2">
                {members.map((m) => {
                  const checked = selectedIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        checked
                          ? "border-[var(--color-primary)] bg-[var(--color-surface-muted)] text-[var(--color-fg)]"
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
            </div>

            {matchingDuplicate ? (
              <div className="space-y-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-950">
                <p className="text-xs font-bold">
                  {labels.duplicateWarningTitle}
                </p>
                <p className="text-xs">
                  {labels.duplicateWarningBody}{" "}
                  <strong>
                    &ldquo;{matchingDuplicate.title}&rdquo; (৳
                    {matchingDuplicate.amount})
                  </strong>
                </p>
                <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-semibold">
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
              ✓ {labels.confirmSaveButton}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
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
    "nextStepsTitle": "শেয়ার কার্ড ও খরচের শিট (ধাপ ৭)",
    "nextStepsBody": "ধাপ ৭ এ হোয়াটসঅ্যাপ ও মেসেঞ্জারে শেয়ার করার মতো খরচের শিট ও ইমেজ কার্ড যুক্ত হবে।"
  },
  "money": {
    "addExpenseTitle": "ম্যানুয়ালি খরচ যোগ করুন",
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
  "aiParser": {
    "cardTitle": "এআই মেসেজ পার্সার (বাংলা / বাংলিশ)",
    "cardSubtitle": "এক লাইনে বাংলা বা বাংলিশে খরচ লিখুন—সেভ করার আগে কনফার্ম কার্ডে সব যাচাই করে নিন",
    "inputPlaceholder": "যেমন: রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই / CNG 450 tk Tanvir paid for Karim and Tanvir",
    "tryExamplesLabel": "উদাহরণে ট্যাপ করে টেস্ট করুন:",
    "parseButton": "এআই দিয়ে হিসাব বের করুন",
    "parsingButton": "হিসাব বের করা হচ্ছে...",
    "confirmCardBadge": "কনফার্ম কার্ড (এখনো সেভ হয়নি)",
    "confirmCardNote": "নিচের তথ্যগুলো যাচাই বা প্রয়োজনে পরিবর্তন করে 'নিশ্চিত করুন ও সেভ করুন' বাটনে চাপুন।",
    "rawInputLabel": "আপনার লেখা টেক্সট:",
    "confirmSaveButton": "নিশ্চিত করুন ও খরচ সেভ করুন",
    "discardDraftButton": "বাতিল করুন",
    "errMissingAmount": "টাকার পরিমাণ খুঁজে পাওয়া যায়নি (যেমন: ১২০০ টাকা বা 1200 tk লিখুন)।",
    "errRateLimited": "অনেকগুলো রিকোয়েস্ট করা হয়েছে! কিছুক্ষণ পর আবার চেষ্টা করুন",
    "errGeneric": "টেক্সটটি বোঝা যায়নি, অনুগ্রহ করে আবার চেষ্টা করুন অথবা নিচের ফর্মে লিখুন।"
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
    "nextStepsTitle": "Share Card & Daily Cost Sheet (Step 7)",
    "nextStepsBody": "Downloadable daily cost sheets and shareable summary images come in Step 7."
  },
  "money": {
    "addExpenseTitle": "Add Expense Manually",
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
  "aiParser": {
    "cardTitle": "AI Expense Parser (Bangla / Banglish)",
    "cardSubtitle": "Type an expense in natural Bangla or Banglish—review and edit on the Confirm Card before saving",
    "inputPlaceholder": "e.g., রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই / CNG 450 tk Tanvir paid for Karim and Tanvir",
    "tryExamplesLabel": "Tap an example to test:",
    "parseButton": "Parse Expense with AI",
    "parsingButton": "Parsing...",
    "confirmCardBadge": "Confirm Card (Not saved yet)",
    "confirmCardNote": "Review or edit any field below, then tap 'Confirm & Save Expense'.",
    "rawInputLabel": "Typed text:",
    "confirmSaveButton": "Confirm & Save Expense",
    "discardDraftButton": "Discard",
    "errMissingAmount": "Could not find a whole-taka amount (e.g., write 1200 tk or ১২০০ টাকা).",
    "errRateLimited": "Too many parse requests! Please wait and try again",
    "errGeneric": "Could not parse that text. Please try again or use the manual form below."
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

// ---- Step 3, 4 & 6: Money Core + Safety Layer + AI Confirm Save ---------

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
    rawInput: formData.get("rawInput") ?? undefined,
    routeFrom: formData.get("routeFrom") ?? undefined,
    routeTo: formData.get("routeTo") ?? undefined,
    placeName: formData.get("placeName") ?? undefined,
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
          rawInput: parsed.data.rawInput ?? null,
          routeFrom: parsed.data.routeFrom ?? null,
          routeTo: parsed.data.routeTo ?? null,
          placeName: parsed.data.placeName ?? null,
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
import { AiExpenseParserCard } from "@/components/AiExpenseParserCard";
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
  const tAi = await getTranslations("aiParser");
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

  // 2. Signed-in Trip Hub View + Steps 3, 4, 5 & 6
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

      {/* Step 6: AI Expense Parser (Bangla + Banglish -> Confirm Card -> Save) */}
      {!isLocked ? (
        <AiExpenseParserCard
          slug={trip.slug}
          members={memberInputs}
          defaultDateYyyyMmDd={defaultExpenseDate}
          existingExpenses={existingExpenseSummaries}
          labels={{
            cardTitle: tAi("cardTitle"),
            cardSubtitle: tAi("cardSubtitle"),
            inputPlaceholder: tAi("inputPlaceholder"),
            tryExamplesLabel: tAi("tryExamplesLabel"),
            parseButton: tAi("parseButton"),
            parsingButton: tAi("parsingButton"),
            confirmCardBadge: tAi("confirmCardBadge"),
            confirmCardNote: tAi("confirmCardNote"),
            rawInputLabel: tAi("rawInputLabel"),
            titleLabel: tMoney("titleLabel"),
            amountLabel: tMoney("amountLabel"),
            categoryLabel: tMoney("categoryLabel"),
            dateLabel: tMoney("dateLabel"),
            paidByLabel: tMoney("paidByLabel"),
            participantsLabel: tMoney("participantsLabel"),
            selectAll: tMoney("selectAll"),
            confirmSaveButton: tAi("confirmSaveButton"),
            discardDraftButton: tAi("discardDraftButton"),
            duplicateWarningTitle: tMoney("duplicateWarningTitle"),
            duplicateWarningBody: tMoney("duplicateWarningBody"),
            confirmDuplicateLabel: tMoney("confirmDuplicateLabel"),
            errMissingAmount: tAi("errMissingAmount"),
            errRateLimited: tAi("errRateLimited"),
            errGeneric: tAi("errGeneric"),
            categories: categoryLabels,
          }}
        />
      ) : null}

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

      {/* Placeholder for Step 7 features */}
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

cat > "${PROJECT_DIR}/docs/STEP6-VERIFY.md" <<'EOF'
# Step 6 — Manual Acceptance Verification Checklist (AI Expense Parser)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Bangla & Banglish Natural Text Parsing + Confirm Card (Never Auto-Saves)
- [ ] At the top of `/trips/<slug>`, locate the **✨ এআই মেসেজ পার্সার (বাংলা / বাংলিশ) (`AI Expense Parser`)** card.
- [ ] Tap the first example chip or type:
      `রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই`
      and click **এআই দিয়ে হিসাব বের করুন (`Parse Expense with AI`)**.
- [ ] Verify the **কনফার্ম কার্ড (`Confirm Card (Not saved yet)`)** opens **without** adding the expense to the trip yet (refreshing or clicking **বাতিল করুন (`Discard`)** leaves balances unchanged).
- [ ] Verify the Confirm Card pre-fills:
  - Title: `রাতের খাবার`
  - Amount: `1200`
  - Category: `🍛 খাবার (Food)`
  - Payer: `Karim` (`করিম`)
  - Participants: all trip members checked
- [ ] Click **✓ নিশ্চিত করুন ও খরচ সেভ করুন (`Confirm & Save Expense`)** and verify the expense is now saved with `rawInput` preserved.

## 2. Subset Participant & Pronoun (`আমি` / `ami`) Matching
- [ ] Type a Banglish subset sentence:
      `CNG bhara 450 tk Tanvir dilo for Karim, Tanvir and Sumi`
      and click Parse.
- [ ] Verify the Confirm Card pre-selects `🚗 যাতায়াত (Transport)`, Amount `450`, Payer `Tanvir`, and checks **only** `Karim`, `Tanvir`, and `Sumi`.
- [ ] Type a first-person sentence:
      `হোটেল বুকিং ৩০০০ টাকা আমি দিয়েছি`
      and verify Payer resolves to your currently signed-in member.

## 3. 25-Sentence Benchmark & Rate Limiter Suite
- [ ] Run `pnpm test` and verify `src/lib/__tests__/step6-ai-parser.test.ts` scores **25/25 (100%)** on `src/lib/__tests__/fixtures/bangla-banglish-25.json` and passes the per-trip and per-IP `SlidingWindowRateLimiter` tests.
EOF

