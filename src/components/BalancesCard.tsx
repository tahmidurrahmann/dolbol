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
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
            <span>📊</span>
            <span>{labels.balancesTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">
            {labels.totalTripSpend}
          </p>
        </div>
        <div className="text-xl sm:text-2xl font-black text-[var(--color-primary)]">
          {formatTaka(totalTripSpend, locale)}
        </div>
      </div>

      {/* Simplified Who Owes Whom */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
          <span>⚡</span>
          <span>{labels.whoOwesWhomTitle}</span>
        </h3>
        {simplifiedDebts.length === 0 ? (
          <p className="rounded-xl bg-white border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-fg-muted)] shadow-2xs">
            {labels.allSettled}
          </p>
        ) : (
          <ul className="space-y-2">
            {simplifiedDebts.map((debt) => {
              const from = memberById.get(debt.fromMemberId);
              const to = memberById.get(debt.toMemberId);
              return (
                <li
                  key={`${debt.fromMemberId}->${debt.toMemberId}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm sm:text-base shadow-2xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-[var(--color-fg)]">
                      {from?.emoji ?? "🎒"}{" "}
                      {from?.displayName ?? debt.fromMemberId}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                      → {labels.owesArrow} →
                    </span>
                    <span className="font-bold text-[var(--color-fg)]">
                      {to?.emoji ?? "🎒"} {to?.displayName ?? debt.toMemberId}
                    </span>
                  </div>
                  <span className="shrink-0 font-extrabold text-[var(--color-primary)]">
                    {formatTaka(debt.amount, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-Member Balance Breakdown Table */}
      <div className="space-y-2.5 pt-1">
        <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
          <span>👥</span>
          <span>{labels.memberBalancesSub}</span>
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-2xs">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-fg-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-3.5 py-2.5">{labels.colMember}</th>
                <th className="px-3 py-2.5 text-right">{labels.colPaid}</th>
                <th className="px-3 py-2.5 text-right">{labels.colOwed}</th>
                <th className="px-3.5 py-2.5 text-right">{labels.colNet}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {balances.map((b) => {
                const netColor =
                  b.netBalance > 0
                    ? "text-[var(--color-primary)] font-bold"
                    : b.netBalance < 0
                      ? "text-red-700 font-bold"
                      : "text-[var(--color-fg-muted)]";

                const statusTag =
                  b.netBalance > 0
                    ? `(${labels.statusGets})`
                    : b.netBalance < 0
                      ? `(${labels.statusOwes})`
                      : `(${labels.statusEven})`;

                return (
                  <tr key={b.memberId} className="hover:bg-[var(--color-surface-muted)]/40 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-[var(--color-fg)]">
                      {b.emoji} {b.displayName}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--color-fg)] font-medium">
                      {formatTaka(b.totalPaid, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--color-fg)] font-medium">
                      {formatTaka(b.totalOwed, locale)}
                    </td>
                    <td className={`px-3.5 py-2.5 text-right ${netColor}`}>
                      <div>
                        {b.netBalance > 0
                          ? `+${formatTaka(b.netBalance, locale)}`
                          : formatTaka(b.netBalance, locale)}
                      </div>
                      <div className="text-[11px] font-normal">{statusTag}</div>
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
