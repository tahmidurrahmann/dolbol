"use client";

import Link from "next/link";
import Image from "next/image";
import type { SupportedLocale } from "@/lib/format";
import { useRecentTrips } from "@/lib/recent-trips";

interface BackToTripBarProps {
  locale: SupportedLocale;
  className?: string;
}

/**
 * Floating sticky button pinned to the side of the screen (like a chat button),
 * allowing users to jump back into their active trip without taking any vertical layout space.
 */
export function BackToTripBar({ locale, className = "" }: BackToTripBarProps) {
  const trips = useRecentTrips();
  const mostRecent = trips[0] ?? null;

  if (!mostRecent) {
    return null;
  }

  const isBn = locale === "bn";
  const tooltipText = isBn
    ? `"${mostRecent.tripName}" ট্রিপে ফিরে যান`
    : `Back to "${mostRecent.tripName}"`;

  return (
    <div
      className={`pointer-events-none fixed right-3.5 bottom-6 sm:right-6 sm:bottom-6 z-40 select-none ${className}`}
    >
      <Link
        href={`/trips/${mostRecent.slug}`}
        title={tooltipText}
        aria-label={tooltipText}
        className="pointer-events-auto group flex items-center gap-1.5 min-[360px]:gap-2 rounded-full border-2 border-white/95 bg-gradient-to-br from-[#0b724f] via-emerald-600 to-teal-700 text-white px-2.5 min-[360px]:px-3.5 py-2 min-[360px]:py-2.5 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 backdrop-blur-md ring-4 ring-emerald-500/20"
      >
        <span className="flex size-7 min-[360px]:size-8 items-center justify-center rounded-full bg-white/20 shadow-2xs group-hover:scale-110 transition-transform shrink-0">
          <Image
            src="/brand/logo-mark-on-dark.svg"
            alt=""
            width={20}
            height={20}
            className="size-5 min-[360px]:size-5.5 shrink-0"
            aria-hidden="true"
          />
        </span>

        <div className="flex flex-col text-left leading-tight max-w-[90px] min-[360px]:max-w-[125px] sm:max-w-[160px] truncate">
          <span className="text-[9px] font-bold text-emerald-100 uppercase tracking-wider truncate">
            {isBn ? "সক্রিয় ট্রিপ" : "Active Trip"}
          </span>
          <span className="text-xs min-[360px]:text-sm font-black truncate">
            {mostRecent.tripName}
          </span>
        </div>

        <span className="flex size-5 min-[360px]:size-6 items-center justify-center rounded-full bg-white text-[#0b724f] text-[10px] min-[360px]:text-xs font-black group-hover:translate-x-0.5 transition-transform shadow-2xs shrink-0">
          →
        </span>
      </Link>
    </div>
  );
}
