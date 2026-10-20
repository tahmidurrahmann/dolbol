import { toBanglaDigits } from "@/lib/format";

export type FetchStrategy = "cache-first" | "network-first" | "network-only";

export interface RequestDescriptor {
  method: string;
  url: string;
  mode?: string;
}

export interface ResponseDescriptor {
  status: number;
  headers: {
    get(name: string): string | null;
  };
}

export const CACHE_PREFIX = "app-cache-";

/**
 * Determines the offline fetch strategy for a given request.
 * Pure function: decisions are deterministic and side-effect free.
 */
export function getFetchStrategy(req: RequestDescriptor): FetchStrategy {
  // Rule 1: Only handle GET requests. All other methods are network-only.
  if (req.method.toUpperCase() !== "GET") {
    return "network-only";
  }

  let pathname = "";
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    return "network-only";
  }

  // Rule 2: NEVER cache /api/*
  if (pathname.startsWith("/api/")) {
    return "network-only";
  }

  // Rule 3: Content-hashed static Next.js assets are cache-first
  if (pathname.startsWith("/_next/static/")) {
    return "cache-first";
  }

  // Common static public assets (icons, manifest)
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg")
  ) {
    return "cache-first";
  }

  // Rule 4: Navigation requests (HTML pages like /trips/[slug]) are network-first with timeout fallback
  if (req.mode === "navigate") {
    return "network-first";
  }

  return "network-only";
}

/**
 * Validates whether a response is safe and eligible to be stored in the cache.
 * Rules:
 * - Must be HTTP 200 OK
 * - MUST NEVER have a Set-Cookie header
 */
export function shouldCacheResponse(res: ResponseDescriptor): boolean {
  if (res.status !== 200) {
    return false;
  }

  const setCookie = res.headers.get("Set-Cookie") || res.headers.get("set-cookie");
  if (setCookie && setCookie.trim().length > 0) {
    return false;
  }

  return true;
}

/**
 * Identifies whether a cache key belongs to this application but is from an older/different build.
 * Used during SW activation to purge obsolete assets.
 */
export function isCacheFromOldBuild(
  cacheName: string,
  currentBuildId: string,
): boolean {
  if (!cacheName.startsWith(CACHE_PREFIX)) {
    return false;
  }

  const expectedRuntime = `${CACHE_PREFIX}runtime-${currentBuildId}`;
  const expectedStatic = `${CACHE_PREFIX}static-${currentBuildId}`;

  return cacheName !== expectedRuntime && cacheName !== expectedStatic;
}

/**
 * Formats a Date object into localized "১২:৩০ PM" or "12:30 PM".
 */
export function formatLastUpdatedTime(date: Date, locale: "bn" | "en"): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  const rawTime = `${hours}:${minutes} ${ampm}`;
  return locale === "bn" ? toBanglaDigits(rawTime) : rawTime;
}
