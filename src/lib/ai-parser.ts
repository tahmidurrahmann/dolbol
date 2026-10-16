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
    /([\u0980-\u09FFa-zA-Z']+)\s+থেকে\s+([\u0980-\u09FFa-zA-Z']+)/i,
  );
  const enRouteMatch = trimmed.match(/\b([a-zA-Z']+)\s+to\s+([a-zA-Z']+)\b/i);
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
