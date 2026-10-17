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

/**
 * In-memory brute-force protection for member PIN verification.
 * Tracks failed attempts per memberId and per client IP.
 * Locks out for 15 minutes after 5 consecutive failures.
 *
 * No database schema change required.
 */

const MAX_MEMBER_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  attempts: number;
  lockedUntil: number | null;
}

const memberAttemptsMap = new Map<string, AttemptRecord>();
const ipAttemptsMap = new Map<string, AttemptRecord>();

function cleanExpired(map: Map<string, AttemptRecord>, now: number) {
  for (const [key, record] of map.entries()) {
    if (record.lockedUntil && record.lockedUntil <= now) {
      map.delete(key);
    }
  }
}

/**
 * Checks if a member or IP is currently locked out from attempting PIN entry.
 */
export function checkPinRateLimit(
  memberId: string,
  ip: string,
  now: number = Date.now(),
): { allowed: boolean; remainingSeconds: number } {
  cleanExpired(memberAttemptsMap, now);
  cleanExpired(ipAttemptsMap, now);

  const memberRecord = memberAttemptsMap.get(memberId);
  if (memberRecord?.lockedUntil && memberRecord.lockedUntil > now) {
    const remainingSeconds = Math.ceil((memberRecord.lockedUntil - now) / 1000);
    return { allowed: false, remainingSeconds };
  }

  const ipRecord = ipAttemptsMap.get(ip);
  if (ipRecord?.lockedUntil && ipRecord.lockedUntil > now) {
    const remainingSeconds = Math.ceil((ipRecord.lockedUntil - now) / 1000);
    return { allowed: false, remainingSeconds };
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Records a failed PIN attempt for a member and client IP.
 * Triggers a 15-minute lockout if threshold is exceeded.
 */
export function recordFailedPinAttempt(
  memberId: string,
  ip: string,
  now: number = Date.now(),
): { isLocked: boolean; remainingAttempts: number; remainingSeconds: number } {
  // Update member record
  const currentMemberRecord = memberAttemptsMap.get(memberId) ?? {
    attempts: 0,
    lockedUntil: null,
  };
  const newMemberAttempts = currentMemberRecord.attempts + 1;
  const isMemberLocked = newMemberAttempts >= MAX_MEMBER_ATTEMPTS;
  const memberLockedUntil = isMemberLocked ? now + LOCKOUT_MS : null;

  memberAttemptsMap.set(memberId, {
    attempts: newMemberAttempts,
    lockedUntil: memberLockedUntil,
  });

  // Update IP record
  const currentIpRecord = ipAttemptsMap.get(ip) ?? {
    attempts: 0,
    lockedUntil: null,
  };
  const newIpAttempts = currentIpRecord.attempts + 1;
  const isIpLocked = newIpAttempts >= MAX_IP_ATTEMPTS;
  const ipLockedUntil = isIpLocked ? now + LOCKOUT_MS : null;

  ipAttemptsMap.set(ip, {
    attempts: newIpAttempts,
    lockedUntil: ipLockedUntil,
  });

  const isLocked = isMemberLocked || isIpLocked;
  const remainingSeconds = isLocked ? Math.ceil(LOCKOUT_MS / 1000) : 0;
  const remainingAttempts = Math.max(0, MAX_MEMBER_ATTEMPTS - newMemberAttempts);

  return {
    isLocked,
    remainingAttempts,
    remainingSeconds,
  };
}

/**
 * Resets the failed attempts counter for a member (e.g. after a successful PIN entry).
 */
export function resetPinRateLimit(memberId: string, ip?: string): void {
  memberAttemptsMap.delete(memberId);
  if (ip) {
    ipAttemptsMap.delete(ip);
  }
}

/**
 * Clears all rate limit records (used in tests).
 */
export function clearAllRateLimits(): void {
  memberAttemptsMap.clear();
  ipAttemptsMap.clear();
}
