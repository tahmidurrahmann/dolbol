"use client";

import { useEffect, useState } from "react";
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
