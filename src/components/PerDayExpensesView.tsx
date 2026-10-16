"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  currentMemberId?: string;
  creatorMemberId?: string | null;
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
  currentMemberId,
  creatorMemberId,
  members,
  dayGroups,
  settlements,
  activityLogs,
  labels,
}: PerDayExpensesViewProps) {
  const router = useRouter();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
    amount: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirmDelete = () => {
    if (!pendingDelete || isPending) return;
    const target = pendingDelete;
    setPendingDelete(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("slug", slug);
        formData.append("expenseId", target.id);
        await deleteExpenseAction(formData);
      } catch {
        // Handled by Next.js redirect
      } finally {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <h2 className="text-lg sm:text-xl font-black text-[var(--color-fg)] flex items-center gap-2">
          <span>🧾</span>
          <span>{labels.perDayTitle}</span>
        </h2>
      </div>

      {dayGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 px-4 py-8 text-center text-sm font-medium text-[var(--color-fg-muted)]">
          <p className="text-2xl mb-1">📝</p>
          <p>{labels.noExpensesYet}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((group) => (
            <div
              key={group.groupKey}
              className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/35 p-4 sm:p-5"
            >
              {/* Day Header & Day Total */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)]/70 pb-3">
                <h3 className="text-base font-extrabold text-[var(--color-fg)] flex items-center gap-1.5">
                  <span>🗓️</span>
                  <span>{group.label}</span>
                </h3>
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-sm font-black text-[var(--color-primary)] border border-[var(--color-border)] shadow-2xs">
                  <span>{labels.dayTotalLabel}</span>
                  <span>{formatTaka(group.dayTotal, locale)}</span>
                </div>
              </div>

              {/* Per-Person Cost Pills from ExpenseShare */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">
                  {labels.perPersonDayCostLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const cost = group.perPersonCost[m.id] ?? 0;
                    if (cost === 0) return null;
                    return (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-fg)] shadow-2xs"
                      >
                        <span>
                          {m.emoji ?? "🎒"} {m.displayName}:
                        </span>
                        <span className="font-extrabold text-[var(--color-primary)]">
                          {formatTaka(cost, locale)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Expenses List for this Day */}
              <ul className="space-y-3 pt-1">
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
                      className="space-y-2.5 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-2xs hover:border-[var(--color-primary)]/40 hover:shadow-xs transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--color-fg-muted)] border border-[var(--color-border)] shrink-0">
                              <span>{labels.categories[exp.category]}</span>
                            </span>
                            <span className="text-base font-extrabold text-[var(--color-fg)] break-words">
                              {exp.title}
                            </span>
                          </div>
                          <p className="flex items-center gap-1 text-xs text-neutral-400 font-medium">
                            <span>{labels.paidByPrefix}</span>
                            <strong className="text-[var(--color-fg)] font-bold">
                              {payer?.emoji ?? "🎒"} {payer?.displayName ?? exp.paidById}
                            </strong>
                          </p>
                        </div>

                        <div className="text-right text-lg sm:text-xl font-black text-[var(--color-fg)] shrink-0">
                          {formatTaka(exp.amount, locale)}
                        </div>
                      </div>

                      {editedAfterSettlement ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{labels.editedAfterSettlementBadge}</span>
                        </div>
                      ) : null}

                      {exp.note ? (
                        <p className="text-xs italic text-neutral-400 bg-[var(--color-surface-muted)]/50 px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
                          💬 {exp.note}
                        </p>
                      ) : null}

                      {/* Individual Share Breakdown */}
                      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-[var(--color-border)]/60">
                        {exp.shares.map((sh) => {
                          const participant = memberById.get(sh.memberId);
                          return (
                            <span
                              key={sh.memberId}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs text-[var(--color-fg)] font-medium"
                            >
                              <span>{participant?.emoji ?? "🎒"} {participant?.displayName}:</span>
                              <strong className="font-extrabold text-[var(--color-primary)]">
                                {formatTaka(sh.amount, locale)}
                              </strong>
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

                      {(() => {
                        const canEditOrDelete =
                          !isLocked &&
                          Boolean(currentMemberId) &&
                          (currentMemberId === exp.paidById ||
                            currentMemberId === exp.createdById ||
                            (Boolean(creatorMemberId) &&
                              currentMemberId === creatorMemberId));

                        if (!canEditOrDelete) return null;

                        return (
                          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/60 pt-2.5">
                            <Link
                              href={`/trips/${slug}?editExpense=${exp.id}#expense-form`}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50 active:scale-98 transition-all shadow-2xs"
                            >
                              <span>✏️</span>
                              <span>{labels.editButton}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({
                                  id: exp.id,
                                  title: exp.title,
                                  amount: exp.amount,
                                })
                              }
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-rose-200 bg-rose-50/50 px-3.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100/70 active:scale-98 transition-all cursor-pointer"
                            >
                              <span>🗑️</span>
                              <span>{labels.deleteButton}</span>
                            </button>
                          </div>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Floating Delete Confirmation Toast */}
      {pendingDelete ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed bottom-20 min-[1000px]:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="rounded-2xl border border-rose-200 bg-white/95 p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5 ring-1 ring-black/5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-xl text-rose-600">
                🗑️
              </span>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">
                  {locale === "bn"
                    ? "এই খরচটি মুছে ফেলতে চান?"
                    : "Delete this expense?"}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  <span className="font-bold text-gray-950">
                    &ldquo;{pendingDelete.title}&rdquo;
                  </span>{" "}
                  <span className="font-extrabold text-[#0b724f]">
                    ({formatTaka(pendingDelete.amount, locale)})
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setPendingDelete(null)}
                className="rounded-full px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {locale === "bn" ? "বাতিল" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-black text-white shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isPending ? (
                  <span>{locale === "bn" ? "মুছছে..." : "Deleting..."}</span>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>
                      {locale === "bn" ? "মুছে ফেলুন" : "Confirm Delete"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
