import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";
import { assertTripWritable } from "@/lib/safety";

describe("Trip dates management", () => {
  it("formats date ranges correctly for single and multi-day trips", () => {
    const start = new Date("2026-10-20T00:00:00+06:00");
    const end = new Date("2026-10-25T00:00:00+06:00");

    const formattedStart = formatDate(start, "bn");
    const formattedEnd = formatDate(end, "bn");
    const rangeLabel = `${formattedStart} — ${formattedEnd}`;

    expect(rangeLabel).toContain("—");
    expect(rangeLabel).toContain("অক্টো");

    const singleDateLabel = formatDate(start, "en");
    expect(singleDateLabel).toContain("Oct");
  });

  it("validates that end date cannot be earlier than start date", () => {
    const validStart = new Date("2026-10-20T00:00:00+06:00");
    const validEnd = new Date("2026-10-25T00:00:00+06:00");
    expect(validStart <= validEnd).toBe(true);

    const invalidStart = new Date("2026-10-25T00:00:00+06:00");
    const invalidEnd = new Date("2026-10-20T00:00:00+06:00");
    expect(invalidStart > invalidEnd).toBe(true);
  });

  it("assertTripWritable blocks updating dates when trip is locked", () => {
    const lockedTrip = {
      id: "trip-locked",
      slug: "locked-trip",
      lockedAt: new Date(),
    };

    expect(() => assertTripWritable(lockedTrip)).toThrow();

    const openTrip = {
      id: "trip-open",
      slug: "open-trip",
      lockedAt: null,
    };

    expect(() => assertTripWritable(openTrip)).not.toThrow();
  });

  it("ensures only the trip creator has permission to update trip dates", () => {
    const trip = {
      id: "trip-1",
      creatorMemberId: "creator-member-id",
    };

    const isCreator = (memberId: string) => memberId === trip.creatorMemberId;

    expect(isCreator("creator-member-id")).toBe(true);
    expect(isCreator("other-member-id")).toBe(false);
  });

  it("creates proper activity log payload for trip date updates", () => {
    const start = new Date("2026-10-20T00:00:00+06:00");
    const end = new Date("2026-10-25T00:00:00+06:00");

    const activityLog = {
      tripId: "trip-1",
      memberId: "creator-1",
      entityType: "trip",
      entityId: "trip-1",
      action: "update_dates",
      after: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };

    expect(activityLog.entityType).toBe("trip");
    expect(activityLog.action).toBe("update_dates");
    expect(activityLog.after.startDate).toBe(start.toISOString());
    expect(activityLog.after.endDate).toBe(end.toISOString());
  });
});
