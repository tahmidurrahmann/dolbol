import { normalizeNameKey } from "@/lib/crypto";
import { formatDate, type SupportedLocale, toBanglaDigits } from "@/lib/format";
import type { MemberInput } from "@/lib/money";
import { dayKey } from "@/lib/time";

export interface DestinationOptionRecordInput {
  id: string;
  tripId: string;
  name: string;
  proposedById: string | null;
  createdAt: Date;
}

export interface VoteRecordInput {
  id: string;
  tripId: string;
  memberId: string;
  optionId: string;
}

export interface VoterBadge {
  memberId: string;
  displayName: string;
  emoji: string;
}

export interface DestinationOptionSummary {
  optionId: string;
  name: string;
  proposedByDisplayName: string | null;
  voteCount: number;
  votePercent: number;
  voters: VoterBadge[];
  isCurrentMemberVote: boolean;
  isLeading: boolean;
}

/**
 * Checks if a proposed destination option name already exists on the trip
 * (case-insensitive, whitespace-normalized).
 */
export function hasDuplicateDestinationOption(
  candidateName: string,
  existingOptions: ReadonlyArray<Pick<DestinationOptionRecordInput, "name">>,
): boolean {
  const target = normalizeNameKey(candidateName);
  if (!target) {
    return false;
  }
  return existingOptions.some((opt) => normalizeNameKey(opt.name) === target);
}

/**
 * Aggregates destination options and votes for a trip.
 * Enforces at most one vote per non-guest member of the trip and sorts options
 * by highest vote count first (tie-broken by createdAt ascending).
 */
export function summarizeDestinationVotes(args: {
  options: ReadonlyArray<DestinationOptionRecordInput>;
  votes: ReadonlyArray<VoteRecordInput>;
  members: ReadonlyArray<MemberInput>;
  currentMemberId: string;
}): {
  totalVotes: number;
  currentMemberOptionId: string | null;
  options: DestinationOptionSummary[];
} {
  const memberById = new Map(args.members.map((m) => [m.id, m]));
  const validOptionIds = new Set(args.options.map((o) => o.id));

  // Enforce one vote per non-guest member (last write wins if array has duplicates)
  const voteByMemberId = new Map<string, string>();
  for (const v of args.votes) {
    const member = memberById.get(v.memberId);
    if (!member || member.isGuest) {
      continue;
    }
    if (!validOptionIds.has(v.optionId)) {
      continue;
    }
    voteByMemberId.set(v.memberId, v.optionId);
  }

  const votersByOptionId = new Map<string, VoterBadge[]>();
  for (const opt of args.options) {
    votersByOptionId.set(opt.id, []);
  }

  for (const [memberId, optionId] of voteByMemberId.entries()) {
    const member = memberById.get(memberId);
    if (!member) continue;
    const list = votersByOptionId.get(optionId);
    if (list) {
      list.push({
        memberId: member.id,
        displayName: member.displayName,
        emoji: member.emoji ?? "🎒",
      });
    }
  }

  const totalVotes = voteByMemberId.size;
  const currentMemberOptionId =
    voteByMemberId.get(args.currentMemberId) ?? null;

  let maxVoteCount = 0;
  for (const list of votersByOptionId.values()) {
    if (list.length > maxVoteCount) {
      maxVoteCount = list.length;
    }
  }

  const sortedOptions = [...args.options].sort((a, b) => {
    const countA = votersByOptionId.get(a.id)?.length ?? 0;
    const countB = votersByOptionId.get(b.id)?.length ?? 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const summaries: DestinationOptionSummary[] = sortedOptions.map((opt) => {
    const voters = votersByOptionId.get(opt.id) ?? [];
    const voteCount = voters.length;
    const votePercent =
      totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    const proposer = opt.proposedById
      ? memberById.get(opt.proposedById)
      : undefined;

    return {
      optionId: opt.id,
      name: opt.name,
      proposedByDisplayName: proposer ? proposer.displayName : null,
      voteCount,
      votePercent,
      voters,
      isCurrentMemberVote: currentMemberOptionId === opt.id,
      isLeading: maxVoteCount > 0 && voteCount === maxVoteCount,
    };
  });

  return {
    totalVotes,
    currentMemberOptionId,
    options: summaries,
  };
}

export interface ItineraryItemRecordInput {
  id: string;
  tripId: string;
  dayNumber: number;
  time: string | null;
  title: string;
  notes: string | null;
  position: number;
  createdById: string | null;
  createdAt: Date;
}

export interface ItineraryDayGroup {
  dayNumber: number;
  label: string;
  items: ItineraryItemRecordInput[];
}

function addDaysToYyyyMmDd(startYyyyMmDd: string, daysToAdd: number): Date {
  const baseMs = Date.parse(`${startYyyyMmDd}T12:00:00+06:00`);
  return new Date(baseMs + daysToAdd * 24 * 60 * 60 * 1000);
}

/**
 * Groups itinerary items by dayNumber (1, 2, ...), ordering items within each day
 * by position ascending, then createdAt ascending.
 * When tripStartDate is present, attaches the formatted Asia/Dhaka date to each day label.
 */
export function groupItineraryByDay(args: {
  items: ReadonlyArray<ItineraryItemRecordInput>;
  tripStartDate?: Date | null;
  locale: SupportedLocale;
}): ItineraryDayGroup[] {
  if (args.items.length === 0) {
    return [];
  }

  const startKey = args.tripStartDate ? dayKey(args.tripStartDate) : null;
  const byDay = new Map<number, ItineraryItemRecordInput[]>();

  for (const item of args.items) {
    const bucket = byDay.get(item.dayNumber) ?? [];
    bucket.push(item);
    byDay.set(item.dayNumber, bucket);
  }

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

  return sortedDays.map((dayNumber) => {
    const bucket = [...(byDay.get(dayNumber) ?? [])].sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    let label: string;
    if (startKey) {
      const dateForDay = addDaysToYyyyMmDd(startKey, dayNumber - 1);
      const formattedDate = formatDate(dateForDay, args.locale);
      label =
        args.locale === "bn"
          ? `দিন ${toBanglaDigits(dayNumber)} · ${formattedDate}`
          : `Day ${dayNumber} · ${formattedDate}`;
    } else {
      label =
        args.locale === "bn"
          ? `দিন ${toBanglaDigits(dayNumber)}`
          : `Day ${dayNumber}`;
    }

    return {
      dayNumber,
      label,
      items: bucket,
    };
  });
}
