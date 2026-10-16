import {
  castDestinationVoteAction,
  proposeDestinationOptionAction,
  setTripDestinationFromOptionAction,
} from "@/app/trips/actions";
import { type SupportedLocale, toBanglaDigits } from "@/lib/format";
import type { DestinationOptionSummary } from "@/lib/planning";

export interface DestinationVotingCardLabels {
  votingTitle: string;
  votingSubtitle: string;
  noOptionsYet: string;
  optionPlaceholder: string;
  addOptionButton: string;
  voteButton: string;
  votedBadge: string;
  topPickBadge: string;
  proposedByPrefix: string;
  votesCountSuffix: string;
  setAsDestinationButton: string;
}

interface DestinationVotingCardProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  isCreator: boolean;
  currentTripDestination: string | null;
  options: DestinationOptionSummary[];
  labels: DestinationVotingCardLabels;
}

export function DestinationVotingCard({
  slug,
  locale,
  isLocked,
  isCreator,
  currentTripDestination,
  options,
  labels,
}: DestinationVotingCardProps) {
  function fmtNum(n: number): string {
    return locale === "bn" ? toBanglaDigits(n) : String(n);
  }

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🗳️</span>
          <span>{labels.votingTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400">
          {labels.votingSubtitle}
        </p>
      </div>

      {/* Propose new destination option form */}
      {!isLocked ? (
        <form action={proposeDestinationOptionAction} className="flex gap-1.5 sm:gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder={labels.optionPlaceholder}
            className="min-h-[40px] sm:min-h-[44px] flex-1 min-w-0 rounded-xl border border-[var(--color-border)] bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
          <button
            type="submit"
            className="inline-flex min-h-[40px] sm:min-h-[44px] shrink-0 items-center justify-center rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-2.5 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            {labels.addOptionButton}
          </button>
        </form>
      ) : null}

      {/* Options & Vote tally list */}
      {options.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noOptionsYet}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {options.map((opt) => {
            const isSelectedDestination =
              currentTripDestination &&
              currentTripDestination.trim().toLowerCase() ===
                opt.name.trim().toLowerCase();

            return (
              <li
                key={opt.optionId}
                className={`space-y-2 rounded-xl border p-3 ${
                  opt.isCurrentMemberVote
                    ? "border-2 border-[var(--color-primary)] bg-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold text-[var(--color-fg)]">
                        {opt.name}
                      </span>
                      {opt.isLeading ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {labels.topPickBadge}
                        </span>
                      ) : null}
                    </div>
                    {opt.proposedByDisplayName ? (
                      <p className="text-xs text-[var(--color-fg-muted)]">
                        {labels.proposedByPrefix} {opt.proposedByDisplayName}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-[var(--color-primary)]">
                      {fmtNum(opt.voteCount)} {labels.votesCountSuffix} (
                      {fmtNum(opt.votePercent)}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full bg-[var(--color-primary)] transition-all motion-reduce:transition-none"
                    style={{ width: `${opt.votePercent}%` }}
                  />
                </div>

                {/* Voter pills */}
                {opt.voters.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {opt.voters.map((v) => (
                      <span
                        key={v.memberId}
                        className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--color-fg)]"
                      >
                        {v.emoji} {v.displayName}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Action buttons (Vote + Creator Set Final Destination) */}
                {!isLocked ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {opt.isCurrentMemberVote ? (
                      <span className="inline-flex min-h-[36px] items-center justify-center rounded-full bg-emerald-100 border border-emerald-300 px-4 py-1.5 text-xs font-black text-[#0f6b4a] select-none cursor-default shadow-2xs">
                        {labels.votedBadge}
                      </span>
                    ) : (
                      <form action={castDestinationVoteAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input
                          type="hidden"
                          name="optionId"
                          value={opt.optionId}
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[36px] items-center justify-center rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-4 py-1.5 text-xs font-bold text-[#0f6b4a] hover:bg-[#daf0e3] active:scale-95 transition-all cursor-pointer shadow-2xs"
                        >
                          {labels.voteButton}
                        </button>
                      </form>
                    )}

                    {isCreator && !isSelectedDestination ? (
                      <form action={setTripDestinationFromOptionAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input
                          type="hidden"
                          name="optionId"
                          value={opt.optionId}
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                        >
                          {labels.setAsDestinationButton}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
