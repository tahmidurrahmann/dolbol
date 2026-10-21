"use client";

import { useMemo } from "react";
import { formatTaka, type SupportedLocale } from "@/lib/format";
import { InviteFriendsCard } from "@/components/InviteFriendsCard";
import {
  computeExpenseShares,
  computeMemberBalances,
  simplifyDebts,
  type ExpenseRecordInput,
  type MemberBalance,
  type MemberInput,
  type SettlementRecordInput,
  type ShareOutput,
  type SimplifiedDebtTransfer,
} from "@/lib/money";
import { useOutbox } from "@/lib/use-outbox";

interface BalancesCardLabels {
  balancesTitle: string;
  totalTripSpend: string;
  whoOwesWhomTitle: string;
  allSettled: string;
  owesArrow: string;
  memberBalancesSub: string;
  colMember: string;
  colPaid: string;
  colOwed: string;
  colNet: string;
  statusGets: string;
  statusOwes: string;
  statusEven: string;
  whoOwesWhomNeedFriends?: string;
}

interface BalancesCardProps {
  slug?: string;
  tripName?: string;
  locale: SupportedLocale;
  totalTripSpend: number;
  balances: MemberBalance[];
  simplifiedDebts: SimplifiedDebtTransfer[];
  members?: MemberInput[];
  serverExpenses?: ExpenseRecordInput[];
  settlements?: SettlementRecordInput[];
  labels: BalancesCardLabels;
}

export function BalancesCard({
  slug,
  tripName,
  locale,
  totalTripSpend,
  balances,
  simplifiedDebts,
  members,
  serverExpenses = [],
  settlements = [],
  labels,
}: BalancesCardProps) {
  const { pendingOps } = useOutbox(slug || "");

  // Compute live local preview if there are pending ops in the outbox
  const activeView = useMemo(() => {
    if (pendingOps.length === 0 || !members || members.length === 0) {
      return {
        balances,
        simplifiedDebts,
        totalTripSpend,
        isUnsyncedPreview: false,
      };
    }

    // Convert pending outbox ops to temporary ExpenseRecordInputs
    const now = new Date();
    const pendingExpenses: ExpenseRecordInput[] = pendingOps.map((op) => {
      let shares: ShareOutput[] = [];
      try {
        shares = computeExpenseShares({
          amount: op.payload.amount,
          paidById: op.payload.paidById,
          splitType: op.payload.splitType,
          participantIds: op.payload.participantIds,
          exactShares: op.payload.exactShares,
          percentShares: op.payload.percentShares,
        });
      } catch {
        shares = [{ memberId: op.payload.paidById, amount: op.payload.amount }];
      }

      return {
        id: op.payload.id,
        title: op.payload.title,
        amount: op.payload.amount,
        category: op.payload.category,
        expenseDate: new Date(`${op.payload.expenseDate}T12:00:00+06:00`),
        paidById: op.payload.paidById,
        createdById: op.payload.paidById,
        splitType: op.payload.splitType,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        shares,
      };
    });

    const combinedExpenses = [...serverExpenses, ...pendingExpenses];
    const previewBalances = computeMemberBalances({
      members,
      expenses: combinedExpenses,
      settlements,
    });
    const previewDebts = simplifyDebts(previewBalances);
    const previewTotalSpend = combinedExpenses.reduce(
      (sum, e) => (e.deletedAt ? sum : sum + e.amount),
      0,
    );

    return {
      balances: previewBalances,
      simplifiedDebts: previewDebts,
      totalTripSpend: previewTotalSpend,
      isUnsyncedPreview: true,
    };
  }, [
    pendingOps,
    balances,
    simplifiedDebts,
    totalTripSpend,
    members,
    serverExpenses,
    settlements,
  ]);

  const memberById = new Map(activeView.balances.map((b) => [b.memberId, b]));

  return (
    <div className="space-y-4 sm:space-y-5 rounded-2xl min-[360px]:rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 min-[360px]:p-5 sm:p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2.5 min-[360px]:gap-3 border-b border-[var(--color-border)] pb-3.5 sm:pb-4">
        <div>
          <h2 className="text-base min-[360px]:text-lg sm:text-xl font-black text-[var(--color-fg)] flex items-center gap-1.5 min-[360px]:gap-2">
            <span>📊</span>
            <span>{labels.balancesTitle}</span>
            {activeView.isUnsyncedPreview ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[11px] font-extrabold shadow-2xs">
                ⚡ {locale === "bn" ? "অসিঙ্কড প্রিভিউ" : "Unsynced preview"}
              </span>
            ) : null}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 font-medium">
            {labels.totalTripSpend}
          </p>
        </div>
        <div className="text-xl min-[360px]:text-2xl sm:text-3xl font-black text-[var(--color-primary)]">
          {formatTaka(activeView.totalTripSpend, locale)}
        </div>
      </div>

      {activeView.isUnsyncedPreview ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-xs font-semibold text-amber-950">
          ℹ️{" "}
          {locale === "bn"
            ? "অফলাইনে যুক্ত খরচের হিসাবসহ প্রিভিউ দেখানো হচ্ছে (অপেক্ষমাণ আউটবক্স)। সার্ভারের সাথে সিঙ্ক হলে এটি চূড়ান্ত হবে।"
            : "Preview includes pending offline expenses. Finalized once synced with server."}
        </div>
      ) : null}

      {/* Simplified Who Owes Whom */}
      <div className="space-y-2.5 min-[360px]:space-y-3">
        <h3 className="text-xs font-extrabold text-neutral-400 flex items-center gap-1.5 uppercase tracking-wider">
          <span>⚡</span>
          <span>{labels.whoOwesWhomTitle}</span>
        </h3>
        {(members?.length ?? 0) < 2 ? (
          <div
            data-testid="who-owes-whom-empty-need-friends"
            className="space-y-3 rounded-2xl bg-[var(--color-surface-muted)]/50 border border-dashed border-[var(--color-border)] p-4 sm:p-5 text-center shadow-2xs"
          >
            <p className="text-2xl">👥</p>
            <p className="text-sm font-semibold text-[var(--color-fg)]">
              {labels.whoOwesWhomNeedFriends ??
                (locale === "bn"
                  ? "বন্ধুরা যোগ দিলে এখানে কে কাকে কত দেবে দেখা যাবে"
                  : "When friends join, see who owes whom here")}
            </p>
            {slug ? (
              <div className="pt-1">
                <InviteFriendsCard
                  slug={slug}
                  tripName={tripName ?? ""}
                  locale={locale}
                  compact={true}
                />
              </div>
            ) : null}
          </div>
        ) : activeView.simplifiedDebts.length === 0 ? (
          <div className="rounded-2xl bg-[var(--color-surface-muted)]/50 border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm font-medium text-neutral-400 shadow-2xs">
            <p className="text-2xl mb-1">🤝</p>
            <p>{labels.allSettled}</p>
          </div>
        ) : (
          <ul className="space-y-2 min-[360px]:space-y-2.5">
            {activeView.simplifiedDebts.map((debt) => {
              const from = memberById.get(debt.fromMemberId);
              const to = memberById.get(debt.toMemberId);
              return (
                <li
                  key={`${debt.fromMemberId}->${debt.toMemberId}`}
                  className="flex flex-wrap items-center justify-between gap-2 min-[360px]:gap-3 rounded-xl min-[360px]:rounded-2xl border border-[var(--color-border)] bg-white px-3 min-[360px]:px-4 py-2.5 min-[360px]:py-3 shadow-2xs hover:border-[var(--color-primary)]/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-1.5 min-[360px]:gap-2">
                    <span className="inline-flex items-center gap-1 font-bold text-xs min-[360px]:text-sm text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-2 min-[360px]:px-2.5 py-1 rounded-xl">
                      <span>{from?.emoji ?? "🎒"}</span>
                      <span className="truncate max-w-[90px] min-[360px]:max-w-[130px] sm:max-w-none">
                        {from?.displayName ?? debt.fromMemberId}
                      </span>
                    </span>
                    <span className="text-[10px] min-[360px]:text-xs font-bold text-neutral-400 bg-stone-100 px-1.5 min-[360px]:px-2 py-0.5 rounded-md">
                      → {labels.owesArrow} →
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-xs min-[360px]:text-sm text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-2 min-[360px]:px-2.5 py-1 rounded-xl">
                      <span>{to?.emoji ?? "🎒"}</span>
                      <span className="truncate max-w-[90px] min-[360px]:max-w-[130px] sm:max-w-none">
                        {to?.displayName ?? debt.toMemberId}
                      </span>
                    </span>
                  </div>
                  <span className="shrink-0 rounded-xl bg-emerald-50 px-2.5 min-[360px]:px-3 py-1 font-black text-emerald-800 border border-emerald-200 text-xs min-[360px]:text-sm sm:text-base shadow-2xs">
                    {formatTaka(debt.amount, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-Member Balance Breakdown Table */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-extrabold text-neutral-400 flex items-center gap-1.5 uppercase tracking-wider">
          <span>👥</span>
          <span>{labels.memberBalancesSub}</span>
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-2xs">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[var(--color-surface-muted)] text-[10px] sm:text-[11px] font-extrabold text-neutral-400 border-b border-[var(--color-border)] uppercase tracking-wider">
              <tr>
                <th className="px-2.5 min-[360px]:px-3 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap">
                  {labels.colMember}
                </th>
                <th className="px-1.5 min-[360px]:px-2.5 sm:px-3 py-2.5 sm:py-3 text-right whitespace-nowrap">
                  {labels.colPaid}
                </th>
                <th className="px-1.5 min-[360px]:px-2.5 sm:px-3 py-2.5 sm:py-3 text-right whitespace-nowrap">
                  {labels.colOwed}
                </th>
                <th className="px-2.5 min-[360px]:px-3 sm:px-4 py-2.5 sm:py-3 text-right whitespace-nowrap">
                  {labels.colNet}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {activeView.balances.map((b) => {
                const netColor =
                  b.netBalance > 0
                    ? "text-emerald-700 font-black"
                    : b.netBalance < 0
                      ? "text-rose-600 font-black"
                      : "text-[var(--color-fg-muted)] font-medium";

                const statusBadge =
                  b.netBalance > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 min-[360px]:px-2 py-0.5 text-[9.5px] min-[360px]:text-[10px] font-extrabold whitespace-nowrap leading-none shadow-2xs">
                      <span>✓</span>
                      <span>{labels.statusGets}</span>
                    </span>
                  ) : b.netBalance < 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-1.5 min-[360px]:px-2 py-0.5 text-[9.5px] min-[360px]:text-[10px] font-extrabold whitespace-nowrap leading-none shadow-2xs">
                      <span>⚠️</span>
                      <span>{labels.statusOwes}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-1.5 min-[360px]:px-2 py-0.5 text-[9.5px] min-[360px]:text-[10px] font-semibold whitespace-nowrap leading-none">
                      <span>🤝</span>
                      <span>{labels.statusEven}</span>
                    </span>
                  );

                return (
                  <tr
                    key={b.memberId}
                    className="hover:bg-[var(--color-surface-muted)]/30 transition-colors"
                  >
                    <td className="px-2.5 min-[360px]:px-3 sm:px-4 py-2.5 sm:py-3 font-bold text-[var(--color-fg)]">
                      <div className="flex items-center gap-1.5 min-[360px]:gap-2 min-w-0">
                        <span className="flex size-6 min-[360px]:size-7 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-sm min-[360px]:text-base shrink-0">
                          {b.emoji}
                        </span>
                        <span className="truncate max-w-[85px] min-[360px]:max-w-[120px] sm:max-w-none text-xs min-[360px]:text-sm">
                          {b.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="px-1.5 min-[360px]:px-2.5 sm:px-3 py-2.5 sm:py-3 text-right text-[var(--color-fg)] font-semibold text-xs min-[360px]:text-sm whitespace-nowrap">
                      {formatTaka(b.totalPaid, locale)}
                    </td>
                    <td className="px-1.5 min-[360px]:px-2.5 sm:px-3 py-2.5 sm:py-3 text-right text-[var(--color-fg-muted)] font-medium text-xs min-[360px]:text-sm whitespace-nowrap">
                      {formatTaka(b.totalOwed, locale)}
                    </td>
                    <td
                      className={`px-2.5 min-[360px]:px-3 sm:px-4 py-2.5 sm:py-3 text-right whitespace-nowrap ${netColor}`}
                    >
                      <div className="text-xs min-[360px]:text-sm sm:text-base font-black tracking-tight leading-tight whitespace-nowrap">
                        {b.netBalance > 0
                          ? `+${formatTaka(b.netBalance, locale)}`
                          : formatTaka(b.netBalance, locale)}
                      </div>
                      <div className="mt-1 flex justify-end">
                        {statusBadge}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
