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
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-fg)]">
            {labels.balancesTitle}
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {labels.totalTripSpend}
          </p>
        </div>
        <div className="text-2xl font-bold text-[var(--color-primary)]">
          {formatTaka(totalTripSpend, locale)}
        </div>
      </div>

      {/* Simplified Who Owes Whom */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--color-fg)]">
          {labels.whoOwesWhomTitle}
        </h3>
        {simplifiedDebts.length === 0 ? (
          <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2.5 text-sm text-[var(--color-fg-muted)]">
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
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-base"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[var(--color-fg)]">
                      {from?.emoji ?? "🎒"}{" "}
                      {from?.displayName ?? debt.fromMemberId}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                      → {labels.owesArrow} →
                    </span>
                    <span className="font-semibold text-[var(--color-fg)]">
                      {to?.emoji ?? "🎒"} {to?.displayName ?? debt.toMemberId}
                    </span>
                  </div>
                  <span className="shrink-0 font-bold text-[var(--color-primary)]">
                    {formatTaka(debt.amount, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-Member Balance Breakdown Table */}
      <div className="space-y-2 pt-1">
        <h3 className="text-sm font-bold text-[var(--color-fg)]">
          {labels.memberBalancesSub}
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-muted)] text-xs font-semibold text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-2">{labels.colMember}</th>
                <th className="px-2 py-2 text-right">{labels.colPaid}</th>
                <th className="px-2 py-2 text-right">{labels.colOwed}</th>
                <th className="px-3 py-2 text-right">{labels.colNet}</th>
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
                  <tr key={b.memberId}>
                    <td className="px-3 py-2 font-medium text-[var(--color-fg)]">
                      {b.emoji} {b.displayName}
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--color-fg)]">
                      {formatTaka(b.totalPaid, locale)}
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--color-fg)]">
                      {formatTaka(b.totalOwed, locale)}
                    </td>
                    <td className={`px-3 py-2 text-right ${netColor}`}>
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
