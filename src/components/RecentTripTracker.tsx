"use client";

import { useEffect } from "react";
import { addRecentTrip } from "@/lib/recent-trips";

interface RecentTripTrackerProps {
  slug: string;
  tripName: string;
  myMemberName: string;
}

/**
 * Updates the local recent trips storage whenever a trip page loads
 * for a device that is an active member of that trip.
 */
export function RecentTripTracker({
  slug,
  tripName,
  myMemberName,
}: RecentTripTrackerProps) {
  useEffect(() => {
    addRecentTrip({
      slug,
      tripName,
      myMemberName,
    });
  }, [slug, tripName, myMemberName]);

  return null;
}
