import { useSyncExternalStore } from "react";
import { z } from "zod";
import { toBanglaDigits, type SupportedLocale } from "@/lib/format";

export const RECENT_TRIPS_STORAGE_KEY = "th_recent_trips";
export const MAX_RECENT_TRIPS = 10;

export const RecentTripSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  tripName: z.string().trim().min(1).max(200),
  myMemberName: z.string().trim().min(1).max(100),
  lastOpened: z.number().int().nonnegative(),
});

export type RecentTrip = z.infer<typeof RecentTripSchema>;

export interface AddRecentTripInput {
  slug: string;
  tripName: string;
  myMemberName: string;
  lastOpened?: number;
}

function resolveStorage(customStorage?: Storage): Storage | null {
  if (customStorage !== undefined) {
    return customStorage;
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function emitUpdateEvent(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("recent-trips-updated"));
    }
  } catch {
    // Ignore error in non-browser or restricted environments
  }
}

/**
 * Reads and validates recent trips from storage.
 * Silently ignores corrupt data and returns an array of at most 10 valid trips,
 * sorted by lastOpened descending (most recent first).
 */
export function getRecentTrips(customStorage?: Storage): RecentTrip[] {
  try {
    const s = resolveStorage(customStorage);
    if (!s) return [];

    let raw: string | null = null;
    try {
      raw = s.getItem(RECENT_TRIPS_STORAGE_KEY);
    } catch {
      return [];
    }

    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const valid: RecentTrip[] = [];
    for (const item of parsed) {
      const res = RecentTripSchema.safeParse(item);
      if (res.success) {
        valid.push(res.data);
      }
    }

    valid.sort((a, b) => b.lastOpened - a.lastOpened);
    return valid.slice(0, MAX_RECENT_TRIPS);
  } catch {
    return [];
  }
}

/**
 * Adds or updates a recent trip entry, moving it to index 0 (top of the list).
 * Caps the total stored entries at 10.
 * Never stores tokens, PINs, or money data.
 */
export function addRecentTrip(
  input: AddRecentTripInput,
  customStorage?: Storage,
): RecentTrip[] {
  try {
    const s = resolveStorage(customStorage);
    if (!s) return [];

    const parsed = RecentTripSchema.safeParse({
      slug: input.slug,
      tripName: input.tripName,
      myMemberName: input.myMemberName,
      lastOpened: input.lastOpened ?? Date.now(),
    });

    if (!parsed.success) {
      return getRecentTrips(customStorage);
    }

    const current = getRecentTrips(customStorage);
    // Remove previous entry for this trip slug if present (move-to-top)
    const filtered = current.filter((t) => t.slug !== parsed.data.slug);
    const updated = [parsed.data, ...filtered].slice(0, MAX_RECENT_TRIPS);

    try {
      s.setItem(RECENT_TRIPS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Quota exceeded or storage blocked, return in-memory updated list
    }

    emitUpdateEvent();
    return updated;
  } catch {
    return [];
  }
}

/**
 * Removes a trip by slug from the local storage list only.
 */
export function removeRecentTrip(
  slug: string,
  customStorage?: Storage,
): RecentTrip[] {
  try {
    const s = resolveStorage(customStorage);
    if (!s) return [];

    const current = getRecentTrips(customStorage);
    const updated = current.filter((t) => t.slug !== slug);

    try {
      s.setItem(RECENT_TRIPS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }

    emitUpdateEvent();
    return updated;
  } catch {
    return [];
  }
}

/**
 * Clears the stored recent trips list.
 */
export function clearRecentTrips(customStorage?: Storage): void {
  try {
    const s = resolveStorage(customStorage);
    if (!s) return;
    try {
      s.removeItem(RECENT_TRIPS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    emitUpdateEvent();
  } catch {
    // Ignore
  }
}

/**
 * Formats a last-opened timestamp in plain, everyday words for Bangla and English.
 */
export function formatLastOpened(
  timestamp: number,
  locale: SupportedLocale,
  now: number = Date.now(),
): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isBn = locale === "bn";

  if (diffMin < 1) {
    return isBn ? "এইমাত্র" : "Just now";
  }

  if (diffMin < 60) {
    return isBn
      ? `${toBanglaDigits(diffMin)} মিনিট আগে`
      : `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  }

  if (diffHours < 24) {
    return isBn
      ? `${toBanglaDigits(diffHours)} ঘণ্টা আগে`
      : `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  if (diffDays === 1) {
    return isBn ? "গতকাল" : "Yesterday";
  }

  if (diffDays < 7) {
    return isBn
      ? `${toBanglaDigits(diffDays)} দিন আগে`
      : `${diffDays} days ago`;
  }

  const dateObj = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat(isBn ? "bn-BD" : "en-BD", {
    month: "short",
    day: "numeric",
  });
  const dateStr = formatter.format(dateObj);
  return isBn ? toBanglaDigits(dateStr) : dateStr;
}

export function subscribeRecentTrips(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("recent-trips-updated", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("recent-trips-updated", callback);
    window.removeEventListener("storage", callback);
  };
}

let cachedSnapshot: RecentTrip[] = [];
let cachedRaw: string | null = null;
const EMPTY_SNAPSHOT: RecentTrip[] = [];

export function getRecentTripsSnapshot(): RecentTrip[] {
  if (typeof window === "undefined") {
    return EMPTY_SNAPSHOT;
  }
  try {
    const raw = window.localStorage.getItem(RECENT_TRIPS_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedSnapshot;
    }
    cachedRaw = raw;
    cachedSnapshot = getRecentTrips();
    return cachedSnapshot;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

/**
 * React hook that cleanly subscribes to recent trips changes with SSR safety.
 */
export function useRecentTrips(): RecentTrip[] {
  return useSyncExternalStore(
    subscribeRecentTrips,
    getRecentTripsSnapshot,
    () => EMPTY_SNAPSHOT,
  );
}

