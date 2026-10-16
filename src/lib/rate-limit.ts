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
