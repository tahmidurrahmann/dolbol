import {
  createSettlementAction,
  deleteSettlementAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
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
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.settlementsTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.settlementSubtitle}
        </p>
      </div>

      {!isLocked && members.length >= 2 ? (
        <form action={createSettlementAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="set-from"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.fromMemberLabel}
              </label>
              <select
                id="set-from"
                name="fromMemberId"
                defaultValue={currentMemberId}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-[var(--color-fg)]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji ?? "🎒"} {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="set-to"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.toMemberLabel}
              </label>
              <select
                id="set-to"
                name="toMemberId"
                defaultValue={defaultReceiverId}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm text-[var(--color-fg)]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji ?? "🎒"} {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="set-amount"
              className="block text-xs font-semibold text-[var(--color-fg)]"
            >
              {labels.settlementAmountLabel}
            </label>
            <input
              id="set-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              required
              placeholder="500"
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base font-semibold text-[var(--color-fg)]"
            />
          </div>

          <Button type="submit" variant="secondary">
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
