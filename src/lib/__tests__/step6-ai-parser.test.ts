import { describe, expect, it } from "vitest";
import fixture25 from "@/lib/__tests__/fixtures/bangla-banglish-25.json";
import {
  matchTripMemberByName,
  NormalizeInputError,
  normalizeInput,
  parsedExpenseDraftSchema,
  parseExpenseDeterministic,
  parseExpensesDeterministicMulti,
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

describe("normalizeInput — line break preservation, whitespace collapsing, and limits", () => {
  it("keeps line breaks, trims each line, collapses internal spaces, and drops empty lines", () => {
    const raw = "   rater  khabar   1200   \n\n\n  shokaler   nasta   200  \n\n  DUPURER  khabar  600  ";
    const normalized = normalizeInput(raw);
    expect(normalized).toBe(
      "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600",
    );
  });

  it("converts Bangla digits to ASCII within multi-line input", () => {
    const raw = "রাতের খাবার ১২০০\nসকালের নাস্তা ২০০\nদুপুরের খাবার ৬০০";
    const normalized = normalizeInput(raw);
    expect(normalized).toBe(
      "রাতের খাবার 1200\nসকালের নাস্তা 200\nদুপুরের খাবার 600",
    );
  });

  it("splits single-line period-separated expenses ('rater khabar 1200. shokaler nasta 200. DUPURER khabar 600')", () => {
    const raw = "rater khabar 1200. shokaler nasta 200. DUPURER khabar 600";
    const normalized = normalizeInput(raw);
    expect(normalized).toBe(
      "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600",
    );
  });

  it("splits single-line Bangla dari-separated expenses ('রাতের খাবার ১২০০। সকালের নাস্তা ২০০। দুপুরের খাবার ৬০০')", () => {
    const raw = "রাতের খাবার ১২০০। সকালের নাস্তা ২০০। দুপুরের খাবার ৬০০";
    const normalized = normalizeInput(raw);
    expect(normalized).toBe(
      "রাতের খাবার 1200\nসকালের নাস্তা 200\nদুপুরের খাবার 600",
    );
  });

  it("splits semicolon and comma-separated expenses while preserving decimals", () => {
    const rawSemicolon = "rater khabar 1200; shokaler nasta 200; DUPURER khabar 600";
    expect(normalizeInput(rawSemicolon)).toBe(
      "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600",
    );

    const rawComma = "rater khabar 1200, shokaler nasta 200, DUPURER khabar 600";
    expect(normalizeInput(rawComma)).toBe(
      "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600",
    );

    const rawDecimal = "hotel 1500.50";
    expect(normalizeInput(rawDecimal)).toBe("hotel 1500.50");
  });

  it("splits single-line space-separated expenses ending with amounts ('rater khabar 1200  dupurer khawon 200 bikaler khawon 400 bus vara 200')", () => {
    const raw = "rater khabar 1200  dupurer khawon 200 bikaler khawon 400 bus vara 200";
    const normalized = normalizeInput(raw);
    expect(normalized).toBe(
      "rater khabar 1200\ndupurer khawon 200\nbikaler khawon 400\nbus vara 200",
    );
  });

  it("handles comma, space, and newline separation alongside each other", () => {
    // 1. Comma separated
    expect(normalizeInput("rater khabar 1200, dupurer khabar 500")).toBe(
      "rater khabar 1200\ndupurer khabar 500",
    );

    // 2. Space separated (no punctuation)
    expect(normalizeInput("rater khabar 1200 dupurer khabar 500")).toBe(
      "rater khabar 1200\ndupurer khabar 500",
    );

    // 3. Newline separated
    expect(normalizeInput("rater khabar 400\ndupurer khabar 500")).toBe(
      "rater khabar 400\ndupurer khabar 500",
    );

    // 4. Combined mixed format (newlines + commas + spaces)
    const mixed = "rater khabar 1200, dupurer khabar 500\nbikaler nasta 150 tea 50";
    expect(normalizeInput(mixed)).toBe(
      "rater khabar 1200\ndupurer khabar 500\nbikaler nasta 150\ntea 50",
    );
  });

  it("enforces max 15 lines limit with too_many_lines error", () => {
    const lines16 = Array.from({ length: 16 }, (_, i) => `item ${i + 1} 100`).join("\n");
    expect(() => normalizeInput(lines16)).toThrow(NormalizeInputError);
    try {
      normalizeInput(lines16);
    } catch (err) {
      expect((err as NormalizeInputError).code).toBe("too_many_lines");
    }
  });

  it("enforces max 200 characters per line limit with line_too_long error", () => {
    const longLine = "a".repeat(201) + " 500";
    expect(() => normalizeInput(longLine)).toThrow(NormalizeInputError);
    try {
      normalizeInput(longLine);
    } catch (err) {
      expect((err as NormalizeInputError).code).toBe("line_too_long");
    }
  });

  it("enforces max 1500 characters total limit with input_too_long error", () => {
    const longInput = "a".repeat(1501);
    expect(() => normalizeInput(longInput)).toThrow(NormalizeInputError);
    try {
      normalizeInput(longInput);
    } catch (err) {
      expect((err as NormalizeInputError).code).toBe("input_too_long");
    }
  });

  it("throws empty_input error when input has no valid lines", () => {
    expect(() => normalizeInput("   \n\n   \t  ")).toThrow(NormalizeInputError);
    try {
      normalizeInput("   \n\n   ");
    } catch (err) {
      expect((err as NormalizeInputError).code).toBe("empty_input");
    }
  });
});

describe("Multi-line parsing, settlements, questions, and completeness", () => {
  it("parses the 3-line example into 3 separate FOOD expenses with correct amounts and lineIndexes", () => {
    const input = "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(3);

    expect(items[0]?.lineIndex).toBe(0);
    expect(items[0]?.amount).toBe(1200);
    expect(items[0]?.category).toBe("FOOD");
    expect(items[0]?.title.toLowerCase()).toContain("rater khabar");

    expect(items[1]?.lineIndex).toBe(1);
    expect(items[1]?.amount).toBe(200);
    expect(items[1]?.category).toBe("FOOD");
    expect(items[1]?.title.toLowerCase()).toContain("shokaler nasta");

    expect(items[2]?.lineIndex).toBe(2);
    expect(items[2]?.amount).toBe(600);
    expect(items[2]?.category).toBe("FOOD");
    expect(items[2]?.title.toLowerCase()).toContain("dupurer khabar");

    for (const item of items) {
      const parsed = parsedExpenseDraftSchema.safeParse(item);
      expect(parsed.success).toBe(true);
    }
  });

  it("parses single-line period-separated expenses ('rater khabar 1200. shokaler nasta 200. DUPURER khabar 600') into 3 separate items", () => {
    const input = "rater khabar 1200. shokaler nasta 200. DUPURER khabar 600";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(3);
    expect(items[0]?.amount).toBe(1200);
    expect(items[0]?.title.toLowerCase()).toContain("rater khabar");

    expect(items[1]?.amount).toBe(200);
    expect(items[1]?.title.toLowerCase()).toContain("shokaler nasta");

    expect(items[2]?.amount).toBe(600);
    expect(items[2]?.title.toLowerCase()).toContain("dupurer khabar");
  });

  it("detects settlement on line 2 (Sumi ke 500 dilam)", () => {
    const input = "rater khabar 1200\nSumi ke 500 dilam\nDUPURER khabar 600";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(3);
    const settlement = items[1]!;
    expect(settlement.isSettlement).toBe(true);
    expect(settlement.amount).toBe(500);
    expect(settlement.receiverMemberId).toBe("sumi");
    expect(settlement.paidByMemberId).toBe("karim");
  });

  it("parses single-line space-separated expenses ('rater khabar 1200  dupurer khawon 200 bikaler khawon 400 bus vara 200') into 4 separate items", () => {
    const input = "rater khabar 1200  dupurer khawon 200 bikaler khawon 400 bus vara 200";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(4);

    expect(items[0]?.amount).toBe(1200);
    expect(items[0]?.category).toBe("FOOD");
    expect(items[0]?.title.toLowerCase()).toContain("rater khabar");

    expect(items[1]?.amount).toBe(200);
    expect(items[1]?.category).toBe("FOOD");
    expect(items[1]?.title.toLowerCase()).toContain("dupurer khawon");

    expect(items[2]?.amount).toBe(400);
    expect(items[2]?.category).toBe("FOOD");
    expect(items[2]?.title.toLowerCase()).toContain("bikaler khawon");

    expect(items[3]?.amount).toBe(200);
    expect(items[3]?.category).toBe("TRANSPORT");
    expect(items[3]?.title.toLowerCase()).toContain("bus vara");
  });

  it("parses comma-separated, space-separated, and newline-separated inputs into separate items", () => {
    // 1. Comma separated
    const itemsComma = parseExpensesDeterministicMulti({
      rawText: "rater khabar 1200, dupurer khabar 500",
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });
    expect(itemsComma).toHaveLength(2);
    expect(itemsComma[0]?.amount).toBe(1200);
    expect(itemsComma[1]?.amount).toBe(500);

    // 2. Space separated (no punctuation)
    const itemsSpace = parseExpensesDeterministicMulti({
      rawText: "rater khabar 1200 dupurer khabar 500",
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });
    expect(itemsSpace).toHaveLength(2);
    expect(itemsSpace[0]?.amount).toBe(1200);
    expect(itemsSpace[1]?.amount).toBe(500);

    // 3. Newline separated
    const itemsNewline = parseExpensesDeterministicMulti({
      rawText: "rater khabar 400\ndupurer khabar 500",
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });
    expect(itemsNewline).toHaveLength(2);
    expect(itemsNewline[0]?.amount).toBe(400);
    expect(itemsNewline[1]?.amount).toBe(500);
  });

  it("handles line without amount ('tickets') by keeping amount=null and asking question", () => {
    const input = "tickets";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.amount).toBeNull();
    expect(items[0]?.question).toBe("টাকার পরিমাণ কত?");
    expect(items[0]?.confidence).toBe("low");
    expect(items[0]?.needsAttention).toBe(true);
  });

  it("handles ambiguous count ('ticket 2 ta 600') by asking if 600 is each or total", () => {
    const input = "ticket 2 ta 600";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.amount).toBe(600);
    expect(items[0]?.question).toContain("প্রতিটির নাকি মোট");
    expect(items[0]?.confidence).toBe("medium");
    expect(items[0]?.needsAttention).toBe(true);
  });

  it("handles naming a person who is not in the trip by asking question", () => {
    const input = "Babul ke 400 dilam";
    const items = parseExpensesDeterministicMulti({
      rawText: input,
      members: BENCHMARK_MEMBERS,
      currentMemberId: "karim",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.question).toContain("Babul");
    expect(items[0]?.confidence).toBe("medium");
    expect(items[0]?.needsAttention).toBe(true);
  });
});

describe("matchTripMemberByName — Bangla, Banglish & pronoun resolution", () => {
  it("matches Bangla script names, Banglish variants, suffixes, and first-person pronouns", () => {
    expect(matchTripMemberByName("করিম", BENCHMARK_MEMBERS, "sumi")?.id).toBe(
      "karim",
    );
    expect(matchTripMemberByName("করিমের", BENCHMARK_MEMBERS, "sumi")?.id).toBe(
      "karim",
    );
    expect(matchTripMemberByName("Korim", BENCHMARK_MEMBERS, "sumi")?.id).toBe(
      "karim",
    );
    expect(matchTripMemberByName("Shumi", BENCHMARK_MEMBERS, "karim")?.id).toBe(
      "sumi",
    );
    expect(
      matchTripMemberByName("Tanbir", BENCHMARK_MEMBERS, "karim")?.id,
    ).toBe("tanvir");
    expect(matchTripMemberByName("মামুন", BENCHMARK_MEMBERS, "karim")?.id).toBe(
      "mamun",
    );
    expect(matchTripMemberByName("আমি", BENCHMARK_MEMBERS, "nabila")?.id).toBe(
      "nabila",
    );
    expect(matchTripMemberByName("ami", BENCHMARK_MEMBERS, "tanvir")?.id).toBe(
      "tanvir",
    );
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
      const actualParticipants = [...draft.participantMemberIds]
        .sort()
        .join(",");
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
