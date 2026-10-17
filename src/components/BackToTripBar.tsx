"use client";

import Link from "next/link";
import type { SupportedLocale } from "@/lib/format";
import { useRecentTrips } from "@/lib/recent-trips";

interface BackToTripBarProps {
  locale: SupportedLocale;
}

/**
 * Persistent top bar shown at the top of the Home and Join pages
 * when a most-recent trip exists on this device.
 */
export function BackToTripBar({ locale }: BackToTripBarProps) {
  const trips = useRecentTrips();
  const mostRecent = trips[0] ?? null;

  if (!mostRecent) {
    return null;
  }

  const isBn = locale === "bn";
  const backText = isBn
    ? `← "${mostRecent.tripName}" ট্রিপে ফিরে যান`
    : `← Back to ${mostRecent.tripName}`;

  return (
    <div className="w-full">
      <Link
        href={`/trips/${mostRecent.slug}`}
        className="group flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/95 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#0b724f] shadow-xs hover:bg-emerald-100 hover:border-emerald-400 active:scale-[0.99] transition-all"
      >
        <div className="flex items-center gap-2 truncate">
          <span className="truncate group-hover:underline">{backText}</span>
        </div>
        <span className="shrink-0 rounded-lg bg-white border border-emerald-300 px-2.5 py-1 text-[11px] sm:text-xs font-black text-[#0b724f] shadow-2xs">
          {isBn ? "খুলুন →" : "Open →"}
        </span>
      </Link>
    </div>
  );
}
