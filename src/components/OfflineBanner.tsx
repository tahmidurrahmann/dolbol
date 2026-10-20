"use client";

import { useOfflineStatus } from "@/lib/offline";
import { formatLastUpdatedTime } from "@/lib/sw-routing";
import type { SupportedLocale } from "@/lib/format";

export interface OfflineBannerProps {
  locale?: SupportedLocale;
  labels?: {
    offlinePrefix?: string;
    readOnlyBadge?: string;
  };
}

export function OfflineBanner({
  locale = "bn",
  labels,
}: OfflineBannerProps) {
  const { isOffline, lastOnlineTime } = useOfflineStatus();

  if (!isOffline) {
    return null;
  }

  const timeStr = lastOnlineTime
    ? formatLastUpdatedTime(lastOnlineTime, locale)
    : "";

  const prefix =
    labels?.offlinePrefix ??
    (locale === "bn" ? "অফলাইন: শেষবার আপডেট" : "Offline: Last updated");
  const badge =
    labels?.readOnlyBadge ?? (locale === "bn" ? "রিড-অনলি মোড" : "Read-only");

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-amber-950 shadow-md backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true" className="text-base shrink-0">
          ⚠️
        </span>
        <span className="truncate">
          {prefix} {timeStr}
        </span>
      </div>
      <span className="shrink-0 rounded-full bg-amber-200/90 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 border border-amber-300/80">
        {badge}
      </span>
    </div>
  );
}
