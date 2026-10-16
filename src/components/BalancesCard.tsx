import { formatTaka, type SupportedLocale } from "@/lib/format";
import type { MemberBalance, SimplifiedDebtTransfer } from "@/lib/money";

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
}

interface BalancesCardProps {
  locale: SupportedLocale;
  totalTripSpend: number;
  balances: MemberBalance[];
  simplifiedDebts: SimplifiedDebtTransfer[];
  labels: BalancesCardLabels;
}

export function BalancesCard({
  locale,
  totalTripSpend,
  balances,
  simplifiedDebts,
  labels,
}: BalancesCardProps) {
  const memberById = new Map(balances.map((b) => [b.memberId, b]));

  return (
    <div className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-[var(--color-fg)] flex items-center gap-2">
            <span>📊</span>
            <span>{labels.balancesTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 font-medium">
            {labels.totalTripSpend}
          </p>
        </div>
        <div className="text-2xl sm:text-3xl font-black text-[var(--color-primary)]">
          {formatTaka(totalTripSpend, locale)}
        </div>
      </div>

      {/* Simplified Who Owes Whom */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-neutral-400 flex items-center gap-1.5 uppercase tracking-wider">
          <span>⚡</span>
          <span>{labels.whoOwesWhomTitle}</span>
        </h3>
        {simplifiedDebts.length === 0 ? (
          <div className="rounded-2xl bg-[var(--color-surface-muted)]/50 border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm font-medium text-neutral-400 shadow-2xs">
            <p className="text-2xl mb-1">🤝</p>
            <p>{labels.allSettled}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {simplifiedDebts.map((debt) => {
              const from = memberById.get(debt.fromMemberId);
              const to = memberById.get(debt.toMemberId);
              return (
                <li
                  key={`${debt.fromMemberId}->${debt.toMemberId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-2xs hover:border-[var(--color-primary)]/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-bold text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-2.5 py-1 rounded-xl">
                      <span>{from?.emoji ?? "🎒"}</span>
                      <span>{from?.displayName ?? debt.fromMemberId}</span>
                    </span>
                    <span className="text-xs font-bold text-neutral-400 bg-stone-100 px-2 py-0.5 rounded-md">
                      → {labels.owesArrow} →
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-[var(--color-fg)] bg-[var(--color-surface-muted)] px-2.5 py-1 rounded-xl">
                      <span>{to?.emoji ?? "🎒"}</span>
                      <span>{to?.displayName ?? debt.toMemberId}</span>
                    </span>
                  </div>
                  <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-1 font-black text-emerald-800 border border-emerald-200 text-sm sm:text-base shadow-2xs">
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
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-muted)] text-[10px] font-extrabold text-neutral-400 border-b border-[var(--color-border)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{labels.colMember}</th>
                <th className="px-3 py-3 text-right">{labels.colPaid}</th>
                <th className="px-3 py-3 text-right">{labels.colOwed}</th>
                <th className="px-4 py-3 text-right">{labels.colNet}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {balances.map((b) => {
                const netColor =
                  b.netBalance > 0
                    ? "text-emerald-700 font-black"
                    : b.netBalance < 0
                      ? "text-rose-600 font-black"
                      : "text-[var(--color-fg-muted)] font-medium";

                const statusBadge =
                  b.netBalance > 0 ? (
                    <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-2xs font-extrabold mt-0.5">
                      ✓ {labels.statusGets}
                    </span>
                  ) : b.netBalance < 0 ? (
                    <span className="inline-block rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 text-2xs font-extrabold mt-0.5">
                      ⚠️ {labels.statusOwes}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-2xs font-semibold mt-0.5">
                      🤝 {labels.statusEven}
                    </span>
                  );

                return (
                  <tr key={b.memberId} className="hover:bg-[var(--color-surface-muted)]/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--color-fg)]">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-base">
                          {b.emoji}
                        </span>
                        <span>{b.displayName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-fg)] font-semibold">
                      {formatTaka(b.totalPaid, locale)}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-fg-muted)] font-medium">
                      {formatTaka(b.totalOwed, locale)}
                    </td>
                    <td className={`px-4 py-3 text-right ${netColor}`}>
                      <div>
                        {b.netBalance > 0
                          ? `+${formatTaka(b.netBalance, locale)}`
                          : formatTaka(b.netBalance, locale)}
                      </div>
                      <div>{statusBadge}</div>
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
