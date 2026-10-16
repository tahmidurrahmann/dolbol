import Link from "next/link";
import { deleteExpenseAction } from "@/app/trips/actions";
import { formatDate, formatTaka, type SupportedLocale } from "@/lib/format";
import {
  type DayExpenseGroup,
  type ExpenseCategoryValue,
  isExpenseEditedAfterSettlement,
  type MemberInput,
  type SettlementRecordInput,
} from "@/lib/money";
import {
  type ActivityLogRecordInput,
  extractExpenseEditHistory,
} from "@/lib/safety";

interface PerDayExpensesViewLabels {
  perDayTitle: string;
  noExpensesYet: string;
  dayTotalLabel: string;
  perPersonDayCostLabel: string;
  paidByPrefix: string;
  editedAfterSettlementBadge: string;
  editHistoryToggle: string;
  editedByPrefix: string;
  editButton: string;
  deleteButton: string;
  categories: Record<ExpenseCategoryValue, string>;
}

interface PerDayExpensesViewProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  members: MemberInput[];
  dayGroups: DayExpenseGroup[];
  settlements: SettlementRecordInput[];
  activityLogs: ActivityLogRecordInput[];
  labels: PerDayExpensesViewLabels;
}

export function PerDayExpensesView({
  slug,
  locale,
  isLocked,
  members,
  dayGroups,
  settlements,
  activityLogs,
  labels,
}: PerDayExpensesViewProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
        <span>🧾</span>
        <span>{labels.perDayTitle}</span>
      </h2>

      {dayGroups.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-4 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noExpensesYet}
        </p>
      ) : (
        <div className="space-y-5">
          {dayGroups.map((group) => (
            <div
              key={group.groupKey}
              className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
            >
              {/* Day Header & Day Total */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                <h3 className="text-base font-bold text-[var(--color-fg)]">
                  {group.label}
                </h3>
                <div className="text-sm font-bold text-[var(--color-primary)]">
                  {labels.dayTotalLabel} {formatTaka(group.dayTotal, locale)}
                </div>
              </div>

              {/* Per-Person Cost Pills from ExpenseShare */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--color-fg-muted)]">
                  {labels.perPersonDayCostLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const cost = group.perPersonCost[m.id] ?? 0;
                    if (cost === 0) return null;
                    return (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-fg)]"
                      >
                        <span>
                          {m.emoji ?? "🎒"} {m.displayName}:
                        </span>
                        <span className="font-bold text-[var(--color-primary)]">
                          {formatTaka(cost, locale)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Expenses List for this Day */}
              <ul className="space-y-2.5 pt-1">
                {group.expenses.map((exp) => {
                  const payer = memberById.get(exp.paidById);
                  const editHistory = extractExpenseEditHistory({
                    expenseId: exp.id,
                    activityLogs,
                    settlements,
                  });
                  const editedAfterSettlement =
                    isExpenseEditedAfterSettlement(exp, settlements) ||
                    editHistory.some((h) => h.editedAfterSettlement);

                  return (
                    <li
                      key={exp.id}
                      className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--color-fg-muted)]">
                              {labels.categories[exp.category]}
                            </span>
                            <span className="font-bold text-[var(--color-fg)]">
                              {exp.title}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                            {labels.paidByPrefix} {payer?.emoji ?? "🎒"}{" "}
                            {payer?.displayName ?? exp.paidById}
                          </p>
                        </div>

                        <div className="text-right font-bold text-[var(--color-fg)]">
                          {formatTaka(exp.amount, locale)}
                        </div>
                      </div>

                      {editedAfterSettlement ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          {labels.editedAfterSettlementBadge}
                        </div>
                      ) : null}

                      {exp.note ? (
                        <p className="text-xs italic text-[var(--color-fg-muted)]">
                          {exp.note}
                        </p>
                      ) : null}

                      {/* Individual Share Breakdown */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {exp.shares.map((sh) => {
                          const participant = memberById.get(sh.memberId);
                          return (
                            <span
                              key={sh.memberId}
                              className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-fg-muted)]"
                            >
                              {participant?.emoji ?? "🎒"}{" "}
                              {participant?.displayName}:{" "}
                              {formatTaka(sh.amount, locale)}
                            </span>
                          );
                        })}
                      </div>

                      {/* Step 4: Expandable Edit History Diff */}
                      {editHistory.length > 0 ? (
                        <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs">
                          <summary className="cursor-pointer font-semibold text-[var(--color-fg)]">
                            {labels.editHistoryToggle} ({editHistory.length})
                          </summary>
                          <ul className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
                            {editHistory.map((h) => {
                              const editor = h.editorMemberId
                                ? memberById.get(h.editorMemberId)
                                : undefined;
                              return (
                                <li
                                  key={h.logId}
                                  className="space-y-0.5 text-[var(--color-fg-muted)]"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span>
                                      {labels.editedByPrefix}{" "}
                                      <strong className="text-[var(--color-fg)]">
                                        {editor
                                          ? `${editor.emoji ?? "🎒"} ${editor.displayName}`
                                          : "—"}
                                      </strong>
                                    </span>
                                    <span>
                                      {formatDate(h.editedAt, locale)}
                                    </span>
                                  </div>
                                  <div className="font-medium text-[var(--color-fg)]">
                                    {h.beforeTitle !== h.afterTitle &&
                                    h.beforeTitle &&
                                    h.afterTitle ? (
                                      <span>
                                        &ldquo;{h.beforeTitle}&rdquo; → &ldquo;
                                        {h.afterTitle}&rdquo;{" "}
                                      </span>
                                    ) : null}
                                    {typeof h.beforeAmount === "number" &&
                                    typeof h.afterAmount === "number" &&
                                    h.beforeAmount !== h.afterAmount ? (
                                      <span>
                                        {formatTaka(h.beforeAmount, locale)} →{" "}
                                        {formatTaka(h.afterAmount, locale)}
                                      </span>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ) : null}

                      {!isLocked ? (
                        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-2">
                          <Link
                            href={`/trips/${slug}?editExpense=${exp.id}#expense-form`}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-border)]"
                          >
                            {labels.editButton}
                          </Link>

                          <form action={deleteExpenseAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="expenseId"
                              value={exp.id}
                            />
                            <button
                              type="submit"
                              className="inline-flex min-h-[36px] items-center rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              {labels.deleteButton}
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
