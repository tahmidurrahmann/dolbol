"use client";

import Link from "next/link";
import type { SupportedLocale } from "@/lib/format";
import {
  formatLastOpened,
  removeRecentTrip,
  useRecentTrips,
} from "@/lib/recent-trips";

export interface RecentTripsLabels {
  sectionTitle: string;
  myMemberPrefix: string;
  removeButtonAria: string;
  removeButtonTitle: string;
}

interface RecentTripsListProps {
  locale: SupportedLocale;
  labels: RecentTripsLabels;
}

/**
 * Renders the "Your trips" section on the Home page above existing content.
 * Each row is a large tappable button (min 56px tall) showing the trip name,
 * member display name, and last-opened time in plain words, plus a local-only remove action.
 */
export function RecentTripsList({ locale, labels }: RecentTripsListProps) {
  const trips = useRecentTrips();

  if (trips.length === 0) {
    return null;
  }

  function handleRemove(e: React.MouseEvent, slug: string) {
    e.preventDefault();
    e.stopPropagation();
    removeRecentTrip(slug);
  }

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-base">
            🌴
          </span>
          <h2 className="text-base sm:text-lg font-black text-[var(--color-fg)]">
            {labels.sectionTitle}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {trips.map((trip) => {
          const lastOpenedPlain = formatLastOpened(trip.lastOpened, locale);

          return (
            <div
              key={trip.slug}
              className="group relative flex min-h-[58px] items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3.5 shadow-2xs hover:border-[var(--color-primary)]/40 hover:bg-neutral-50/60 active:scale-[0.99] transition-all"
            >
              <Link
                href={`/trips/${trip.slug}`}
                className="flex min-w-0 flex-1 flex-col justify-center gap-1 focus:outline-hidden"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="truncate font-black text-sm sm:text-base text-[var(--color-fg)] group-hover:text-[var(--color-primary)] transition-colors">
                    {trip.tripName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span>👤</span>
                    <span className="font-semibold text-neutral-700">
                      {labels.myMemberPrefix} {trip.myMemberName}
                    </span>
                  </span>
                  <span className="text-neutral-300">•</span>
                  <span className="flex items-center gap-1 text-neutral-400">
                    <span>🕒</span>
                    <span>{lastOpenedPlain}</span>
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={(e) => handleRemove(e, trip.slug)}
                title={labels.removeButtonTitle}
                aria-label={`${labels.removeButtonAria}: ${trip.tripName}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-red-600 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-sm font-bold leading-none">✕</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
