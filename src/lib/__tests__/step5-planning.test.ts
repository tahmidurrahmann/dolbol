import { describe, expect, it } from "vitest";
import {
  groupItineraryByDay,
  hasDuplicateDestinationOption,
  summarizeDestinationVotes,
} from "@/lib/planning";

const MEMBERS = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
  { id: "mamun_guest", displayName: "Mamun", emoji: "👤", isGuest: true },
];

describe("destination options & one-vote-per-member aggregation", () => {
  it("detects duplicate destination option names case-insensitively", () => {
    const existing = [{ name: "কক্সবাজার" }, { name: "Cox's Bazar" }];
    expect(hasDuplicateDestinationOption("  কক্সবাজার  ", existing)).toBe(true);
    expect(hasDuplicateDestinationOption("cox's   bazar", existing)).toBe(true);
    expect(hasDuplicateDestinationOption("শ্রীমঙ্গল", existing)).toBe(false);
  });

  it("aggregates one vote per non-guest member, ranks options, and marks leading & current vote", () => {
    const options = [
      {
        id: "opt-sajek",
        tripId: "trip-1",
        name: "সাজেক ভ্যালি",
        proposedById: "karim",
        createdAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "opt-sundarban",
        tripId: "trip-1",
        name: "সুন্দরবন",
        proposedById: "sumi",
        createdAt: new Date("2026-10-15T11:00:00Z"),
      },
    ];

    const votes = [
      {
        id: "v1",
        tripId: "trip-1",
        memberId: "karim",
        optionId: "opt-sundarban",
      },
      {
        id: "v2",
        tripId: "trip-1",
        memberId: "sumi",
        optionId: "opt-sundarban",
      },
      { id: "v3", tripId: "trip-1", memberId: "tanvir", optionId: "opt-sajek" },
      // Guest vote should be ignored even if passed in
      {
        id: "v4",
        tripId: "trip-1",
        memberId: "mamun_guest",
        optionId: "opt-sajek",
      },
    ];

    const summary = summarizeDestinationVotes({
      options,
      votes,
      members: MEMBERS,
      currentMemberId: "karim",
    });

    expect(summary.totalVotes).toBe(3);
    expect(summary.currentMemberOptionId).toBe("opt-sundarban");

    // Sundarban has 2 votes (67%), Sajek has 1 vote (33%)
    expect(summary.options[0]?.optionId).toBe("opt-sundarban");
    expect(summary.options[0]?.voteCount).toBe(2);
    expect(summary.options[0]?.votePercent).toBe(67);
    expect(summary.options[0]?.isLeading).toBe(true);
    expect(summary.options[0]?.isCurrentMemberVote).toBe(true);

    expect(summary.options[1]?.optionId).toBe("opt-sajek");
    expect(summary.options[1]?.voteCount).toBe(1);
    expect(summary.options[1]?.votePercent).toBe(33);
    expect(summary.options[1]?.isLeading).toBe(false);
    expect(summary.options[1]?.isCurrentMemberVote).toBe(false);
  });
});

describe("groupItineraryByDay — day-by-day itinerary ordering & labels", () => {
  it("groups items by dayNumber, sorts by position, and formats Asia/Dhaka day labels", () => {
    const items = [
      {
        id: "it-2",
        tripId: "trip-1",
        dayNumber: 1,
        time: "14:00",
        title: "হোটেলে চেক-ইন ও দুপুরের খাবার",
        notes: null,
        position: 2,
        createdById: "karim",
        createdAt: new Date("2026-10-15T10:05:00Z"),
      },
      {
        id: "it-1",
        tripId: "trip-1",
        dayNumber: 1,
        time: "08:30",
        title: "খুলনা থেকে লঞ্চে যাত্রা",
        notes: "সকাল ৮টার মধ্যে ঘাটে থাকতে হবে",
        position: 1,
        createdById: "karim",
        createdAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "it-3",
        tripId: "trip-1",
        dayNumber: 2,
        time: "06:30",
        title: "কটকা অভয়ারণ্য ভ্রমণ",
        notes: null,
        position: 1,
        createdById: "sumi",
        createdAt: new Date("2026-10-15T10:10:00Z"),
      },
    ];

    const groupsBn = groupItineraryByDay({
      items,
      tripStartDate: new Date("2026-10-16T00:00:00+06:00"),
      locale: "bn",
    });

    expect(groupsBn).toHaveLength(2);
    expect(groupsBn[0]?.dayNumber).toBe(1);
    expect(groupsBn[0]?.label).toContain("দিন ১ ·");
    expect(groupsBn[0]?.items.map((i) => i.id)).toEqual(["it-1", "it-2"]);

    expect(groupsBn[1]?.dayNumber).toBe(2);
    expect(groupsBn[1]?.label).toContain("দিন ২ ·");
    expect(groupsBn[1]?.items.map((i) => i.id)).toEqual(["it-3"]);
  });
});
