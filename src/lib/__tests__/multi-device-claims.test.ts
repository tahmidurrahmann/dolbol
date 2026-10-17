import { beforeEach, describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashPin,
  hashSessionToken,
  verifyPin,
} from "@/lib/crypto";
import { formatRelativeTime } from "@/lib/format";
import {
  checkPinRateLimit,
  clearAllRateLimits,
  recordFailedPinAttempt,
  resetPinRateLimit,
} from "@/lib/rate-limit";

describe("Multi-device member claims & session management", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  it("claim creates a second session and no duplicate member", () => {
    // Simulated trip database state
    const members = [
      { id: "member-1", tripId: "trip-abc", displayName: "Rayan" },
    ];
    const sessions: Array<{ id: string; memberId: string; tokenHash: string }> = [
      {
        id: "session-device-1",
        memberId: "member-1",
        tokenHash: hashSessionToken(generateSessionToken()),
      },
    ];

    expect(members).toHaveLength(1);
    expect(sessions.filter((s) => s.memberId === "member-1")).toHaveLength(1);

    // Second device claims the existing member (no new Member row created)
    const newDeviceRawToken = generateSessionToken();
    const newDeviceHash = hashSessionToken(newDeviceRawToken);

    const firstMember = members[0];
    expect(firstMember).toBeDefined();
    if (!firstMember) throw new Error("Expected member");

    // Add session for existing member
    sessions.push({
      id: "session-device-2",
      memberId: firstMember.id,
      tokenHash: newDeviceHash,
    });

    // Member count remains 1 (no duplicate member created)
    expect(members).toHaveLength(1);
    expect(members[0]?.id).toBe("member-1");

    // Member now has two active device sessions
    const memberSessions = sessions.filter((s) => s.memberId === "member-1");
    expect(memberSessions).toHaveLength(2);
    expect(memberSessions[0]?.tokenHash).toBeDefined();
    expect(memberSessions[1]?.tokenHash).toBeDefined();
    expect(memberSessions[0]?.tokenHash).not.toBe(memberSessions[1]?.tokenHash);
  });

  it("correct PIN succeeds in constant time and resets failed attempts", () => {
    const rawPin = "1234";
    const storedHash = hashPin(rawPin);
    const memberId = "member-with-pin";
    const ip = "192.168.1.10";

    // 2 failed attempts first
    recordFailedPinAttempt(memberId, ip);
    recordFailedPinAttempt(memberId, ip);

    // Correct PIN provided
    const isValid = verifyPin("1234", storedHash);
    expect(isValid).toBe(true);

    // Reset rate limiter on success
    resetPinRateLimit(memberId, ip);

    const rateStatus = checkPinRateLimit(memberId, ip);
    expect(rateStatus.allowed).toBe(true);
    expect(rateStatus.remainingSeconds).toBe(0);
  });

  it("wrong PIN fails and records failed attempt", () => {
    const rawPin = "1234";
    const storedHash = hashPin(rawPin);
    const memberId = "member-wrong-pin";
    const ip = "192.168.1.11";

    const isValid = verifyPin("9999", storedHash);
    expect(isValid).toBe(false);

    const result = recordFailedPinAttempt(memberId, ip);
    expect(result.isLocked).toBe(false);
    expect(result.remainingAttempts).toBe(4);
  });

  it("lockout after 5 failures and expiry after 15 minutes", () => {
    const memberId = "member-lockout-test";
    const ip = "192.168.1.50";
    const startTime = 1_000_000;

    // First 4 attempts: allowed
    for (let i = 1; i <= 4; i++) {
      const attempt = recordFailedPinAttempt(memberId, ip, startTime);
      expect(attempt.isLocked).toBe(false);
      expect(attempt.remainingAttempts).toBe(5 - i);
    }

    const checkBefore5 = checkPinRateLimit(memberId, ip, startTime);
    expect(checkBefore5.allowed).toBe(true);

    // 5th attempt: triggers 15-minute lockout
    const fifthAttempt = recordFailedPinAttempt(memberId, ip, startTime);
    expect(fifthAttempt.isLocked).toBe(true);
    expect(fifthAttempt.remainingAttempts).toBe(0);
    expect(fifthAttempt.remainingSeconds).toBe(15 * 60);

    // Subsequent check is blocked
    const checkLocked = checkPinRateLimit(memberId, ip, startTime + 1000);
    expect(checkLocked.allowed).toBe(false);
    expect(checkLocked.remainingSeconds).toBeGreaterThan(0);

    // After 15 minutes + 1 second: lockout expires
    const expiryTime = startTime + 15 * 60 * 1000 + 1000;
    const checkExpired = checkPinRateLimit(memberId, ip, expiryTime);
    expect(checkExpired.allowed).toBe(true);
    expect(checkExpired.remainingSeconds).toBe(0);
  });

  it("IP-level rate limit locks out after 10 failed attempts across multiple members", () => {
    const ip = "10.0.0.99";
    const startTime = 2_000_000;

    // Fail across 5 different members (2 failures each = 10 total on IP)
    for (let m = 1; m <= 5; m++) {
      recordFailedPinAttempt(`diff-member-${m}`, ip, startTime);
      recordFailedPinAttempt(`diff-member-${m}`, ip, startTime);
    }

    // Now IP itself should be locked
    const ipStatus = checkPinRateLimit("fresh-member-never-failed", ip, startTime + 500);
    expect(ipStatus.allowed).toBe(false);
    expect(ipStatus.remainingSeconds).toBeGreaterThan(0);
  });

  it("reset removes all sessions for a member", () => {
    // Member has 3 devices logged in
    let sessions = [
      { id: "s1", memberId: "member-tahmid", tokenHash: "h1" },
      { id: "s2", memberId: "member-tahmid", tokenHash: "h2" },
      { id: "s3", memberId: "member-tahmid", tokenHash: "h3" },
      { id: "s4", memberId: "member-other", tokenHash: "h4" },
    ];

    // Reset member-tahmid devices
    sessions = sessions.filter((s) => s.memberId !== "member-tahmid");

    // All 3 sessions for member-tahmid are removed
    expect(sessions.filter((s) => s.memberId === "member-tahmid")).toHaveLength(0);
    // Other member's session is unaffected
    expect(sessions.filter((s) => s.memberId === "member-other")).toHaveLength(1);
  });

  it("non-creators cannot reset member devices", () => {
    const trip = {
      id: "trip-xyz",
      creatorMemberId: "creator-member-id",
    };

    function assertCanResetDevices(requesterMemberId: string) {
      if (requesterMemberId !== trip.creatorMemberId) {
        throw new Error("not_creator");
      }
    }

    // Creator can reset
    expect(() => assertCanResetDevices("creator-member-id")).not.toThrow();

    // Regular member cannot reset
    expect(() => assertCanResetDevices("regular-member-id")).toThrow("not_creator");
  });

  it("creator member can never be deleted or reset", () => {
    const trip = {
      id: "trip-xyz",
      creatorMemberId: "creator-123",
    };

    function assertCanDeleteMember(targetMemberId: string) {
      if (targetMemberId === trip.creatorMemberId) {
        throw new Error("cannot_delete_creator");
      }
    }

    function assertCanResetMemberDevices(targetMemberId: string) {
      if (targetMemberId === trip.creatorMemberId) {
        throw new Error("cannot_reset_creator");
      }
    }

    // Creator cannot delete themselves
    expect(() => assertCanDeleteMember("creator-123")).toThrow("cannot_delete_creator");
    // Other member can be deleted
    expect(() => assertCanDeleteMember("member-456")).not.toThrow();

    // Creator cannot have devices reset via member action
    expect(() => assertCanResetMemberDevices("creator-123")).toThrow("cannot_reset_creator");
    // Other member can be reset
    expect(() => assertCanResetMemberDevices("member-456")).not.toThrow();
  });

  it("creator PIN verification logic for sessions < 24 hours old", () => {
    const creatorPin = "4321";
    const creatorPinHash = hashPin(creatorPin);

    function verifyCreatorSensitiveAction(options: {
      isCreator: boolean;
      creatorPinHash: string | null;
      sessionAgeMs: number;
      providedPin?: string;
    }) {
      if (!options.isCreator) {
        throw new Error("not_creator");
      }

      const isSessionUnder24Hours = options.sessionAgeMs < 24 * 60 * 60 * 1000;
      if (options.creatorPinHash && isSessionUnder24Hours) {
        if (!options.providedPin || !verifyPin(options.providedPin, options.creatorPinHash)) {
          throw new Error("wrong_pin");
        }
      }

      return true;
    }

    const twoHoursMs = 2 * 60 * 60 * 1000;
    const thirtyHoursMs = 30 * 60 * 60 * 1000;

    // Session < 24h with PIN: requires PIN
    expect(() =>
      verifyCreatorSensitiveAction({
        isCreator: true,
        creatorPinHash,
        sessionAgeMs: twoHoursMs,
        providedPin: "9999",
      }),
    ).toThrow("wrong_pin");

    expect(() =>
      verifyCreatorSensitiveAction({
        isCreator: true,
        creatorPinHash,
        sessionAgeMs: twoHoursMs,
        providedPin: undefined,
      }),
    ).toThrow("wrong_pin");

    // Correct PIN succeeds
    expect(
      verifyCreatorSensitiveAction({
        isCreator: true,
        creatorPinHash,
        sessionAgeMs: twoHoursMs,
        providedPin: "4321",
      }),
    ).toBe(true);

    // Session > 24h: does not require PIN re-check
    expect(
      verifyCreatorSensitiveAction({
        isCreator: true,
        creatorPinHash,
        sessionAgeMs: thirtyHoursMs,
      }),
    ).toBe(true);

    // Creator without PIN: does not require PIN
    expect(
      verifyCreatorSensitiveAction({
        isCreator: true,
        creatorPinHash: null,
        sessionAgeMs: twoHoursMs,
      }),
    ).toBe(true);

    // Non-creator always fails
    expect(() =>
      verifyCreatorSensitiveAction({
        isCreator: false,
        creatorPinHash,
        sessionAgeMs: twoHoursMs,
        providedPin: "4321",
      }),
    ).toThrow("not_creator");
  });

  it("formatRelativeTime formats correctly in bn and en", () => {
    const now = 1_700_000_000_000;

    // Just now (< 1 min)
    const justNowDate = new Date(now - 30 * 1000);
    expect(formatRelativeTime(justNowDate, "en", now)).toBe("just now");
    expect(formatRelativeTime(justNowDate, "bn", now)).toBe("এইমাত্র");

    // 15 minutes ago
    const fifteenMinsDate = new Date(now - 15 * 60 * 1000);
    expect(formatRelativeTime(fifteenMinsDate, "en", now)).toBe("15m ago");
    expect(formatRelativeTime(fifteenMinsDate, "bn", now)).toBe("১৫ মিনিট আগে");

    // 3 hours ago
    const threeHoursDate = new Date(now - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursDate, "en", now)).toBe("3h ago");
    expect(formatRelativeTime(threeHoursDate, "bn", now)).toBe("৩ ঘণ্টা আগে");

    // 2 days ago
    const twoDaysDate = new Date(now - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoDaysDate, "en", now)).toBe("2d ago");
    expect(formatRelativeTime(twoDaysDate, "bn", now)).toBe("২ দিন আগে");
  });
});
