"use client";

import { useEffect, useState } from "react";
import { clearOpsForTrip } from "@/lib/outbox";
import { CACHE_PREFIX } from "@/lib/sw-routing";

/**
 * Hook to track whether the browser is offline and the timestamp of last online status.
 */
export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      setLastOnlineTime(new Date());

      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => {
        setIsOffline(true);
        setLastOnlineTime((prev) => prev ?? new Date());
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  return { isOffline, lastOnlineTime };
}

/**
 * Removes cached HTML navigation pages for THIS trip only from Service Worker runtime cache.
 * Leaves static caches, assets, and other trips' cached pages untouched.
 */
export async function clearTripRuntimeCache(tripSlug: string): Promise<number> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return 0;
  }

  let deletedCount = 0;
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    if (name.startsWith(CACHE_PREFIX) && name.includes("runtime")) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        try {
          const baseOrigin =
            typeof window !== "undefined" && window.location
              ? window.location.origin
              : "http://localhost";
          const url = new URL(req.url, baseOrigin);
          if (
            url.pathname === `/trips/${tripSlug}` ||
            url.pathname.startsWith(`/trips/${tripSlug}/`)
          ) {
            const success = await cache.delete(req);
            if (success) {
              deletedCount++;
            }
          }
        } catch {
          // ignore malformed URLs
        }
      }
    }
  }

  return deletedCount;
}

/**
 * Clears offline data for THIS trip only:
 * 1. Runtime page cache for this trip in CacheStorage
 * 2. Unsynced/pending outbox operations for this trip in IndexedDB
 *
 * Leaves other trips, static caches, session cookie, and recent-trips list untouched.
 */
export async function clearTripOfflineData(tripSlug: string): Promise<{
  cachedPagesDeleted: number;
}> {
  const cachedPagesDeleted = await clearTripRuntimeCache(tripSlug);
  await clearOpsForTrip(tripSlug);
  return { cachedPagesDeleted };
}

/**
 * Removes all offline caches on this device.
 */
export async function clearAppOfflineCaches(): Promise<number> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return 0;
  }

  const keys = await caches.keys();
  const appKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  await Promise.all(appKeys.map((k) => caches.delete(k)));
  return appKeys.length;
}
