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
