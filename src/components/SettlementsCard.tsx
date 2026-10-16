import {
  createSettlementAction,
  deleteSettlementAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { formatDate, formatTaka, type SupportedLocale } from "@/lib/format";
import type { MemberInput, SettlementRecordInput } from "@/lib/money";

interface SettlementsCardLabels {
  settlementsTitle: string;
  settlementSubtitle: string;
  fromMemberLabel: string;
  toMemberLabel: string;
  settlementAmountLabel: string;
  recordSettlementButton: string;
  recordedSettlementsList: string;
  paidBackText: string;
  toText: string;
  deleteButton: string;
}

interface SettlementsCardProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  currentMemberId: string;
  members: MemberInput[];
  settlements: SettlementRecordInput[];
  labels: SettlementsCardLabels;
}

export function SettlementsCard({
  slug,
  locale,
  isLocked,
  currentMemberId,
  members,
  settlements,
  labels,
}: SettlementsCardProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const activeSettlements = settlements.filter((s) => !s.deletedAt);
  const defaultReceiverId =
    members.find((m) => m.id !== currentMemberId)?.id ?? currentMemberId;

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🤝</span>
          <span>{labels.settlementsTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">
          {labels.settlementSubtitle}
        </p>
      </div>

      {!isLocked && members.length >= 2 ? (
        <form
          action={createSettlementAction}
          className="space-y-3.5 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs"
        >
          <input type="hidden" name="slug" value={slug} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              id="set-from"
              name="fromMemberId"
              defaultValue={currentMemberId}
              label={labels.fromMemberLabel}
              required
              searchable={members.length > 5}
              options={members.map((m) => ({
                value: m.id,
                label: m.displayName,
                icon: m.emoji ?? "🎒",
                badge: m.isGuest ? "Guest" : undefined,
              }))}
            />

            <SelectField
              id="set-to"
              name="toMemberId"
              defaultValue={defaultReceiverId}
              label={labels.toMemberLabel}
              required
              searchable={members.length > 5}
              options={members.map((m) => ({
                value: m.id,
                label: m.displayName,
                icon: m.emoji ?? "🎒",
                badge: m.isGuest ? "Guest" : undefined,
              }))}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="set-amount"
              className="block text-xs font-bold text-[var(--color-fg)]"
            >
              {labels.settlementAmountLabel}{" "}
              <span className="text-red-500 font-bold">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-base font-bold text-[var(--color-fg-muted)]">
                ৳
              </span>
              <input
                id="set-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                required
                placeholder="500"
                className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3.5 py-2 text-base font-bold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          <Button type="submit" variant="primary">
            {labels.recordSettlementButton}
          </Button>
        </form>
      ) : null}

      {activeSettlements.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <h3 className="text-sm font-bold text-[var(--color-fg)]">
            {labels.recordedSettlementsList}
          </h3>
          <ul className="space-y-2">
            {activeSettlements.map((s) => {
              const from = memberById.get(s.fromMemberId);
              const to = memberById.get(s.toMemberId);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-[var(--color-fg)]">
                      <span className="font-semibold">
                        {from?.emoji ?? "🎒"} {from?.displayName}
                      </span>{" "}
                      {labels.paidBackText}{" "}
                      <span className="font-bold text-[var(--color-primary)]">
                        {formatTaka(s.amount, locale)}
                      </span>{" "}
                      →{" "}
                      <span className="font-semibold">
                        {to?.emoji ?? "🎒"} {to?.displayName}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-fg-muted)]">
                      {formatDate(s.createdAt, locale)}
                    </div>
                  </div>

                  {!isLocked ? (
                    <form action={deleteSettlementAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="settlementId" value={s.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-[36px] items-center rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        {labels.deleteButton}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
