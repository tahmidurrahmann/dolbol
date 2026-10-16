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
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🗳️</span>
          <span>{labels.votingTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">
          {labels.votingSubtitle}
        </p>
      </div>

      {/* Propose new destination option form */}
      {!isLocked ? (
        <form action={proposeDestinationOptionAction} className="flex gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder={labels.optionPlaceholder}
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
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
                    <form action={castDestinationVoteAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input
                        type="hidden"
                        name="optionId"
                        value={opt.optionId}
                      />
                      <button
                        type="submit"
                        disabled={opt.isCurrentMemberVote}
                        className={`inline-flex min-h-[38px] items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                          opt.isCurrentMemberVote
                            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                            : "bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                        }`}
                      >
                        {opt.isCurrentMemberVote
                          ? labels.votedBadge
                          : labels.voteButton}
                      </button>
                    </form>

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
                          className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-surface-muted)]"
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
