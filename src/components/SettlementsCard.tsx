"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createSettlementAction,
  deleteSettlementAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { formatDate, formatTaka, type SupportedLocale } from "@/lib/format";
import { useOfflineStatus } from "@/lib/offline";
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
  creatorMemberId?: string | null;
  members: MemberInput[];
  settlements: SettlementRecordInput[];
  labels: SettlementsCardLabels;
}

export function SettlementsCard({
  slug,
  locale,
  isLocked,
  currentMemberId,
  creatorMemberId,
  members,
  settlements,
  labels,
}: SettlementsCardProps) {
  const router = useRouter();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const activeSettlements = settlements.filter((s) => !s.deletedAt);
  const defaultReceiverId =
    members.find((m) => m.id !== currentMemberId)?.id ?? currentMemberId;
  const { isOffline } = useOfflineStatus();

  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    fromName: string;
    toName: string;
    amount: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("settlementId", target.id);
      await deleteSettlementAction(formData);
    } catch {
      // Handled by Next.js redirect
    } finally {
      setIsDeleting(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🤝</span>
          <span>{labels.settlementsTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400">
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
                className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-10 pr-3.5 py-2 text-base font-bold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          {isOffline ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-center text-xs font-bold text-amber-900">
              ⚠️{" "}
              {locale === "bn"
                ? "ইন্টারনেট লাগবে, অফলাইনে পরিশোধ রেকর্ড করা যাবে না"
                : "Internet required, cannot record settlement offline"}
            </div>
          ) : null}

          <Button type="submit" variant="primary" disabled={isOffline}>
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
                    <div className="text-xs text-neutral-400">
                      {formatDate(s.createdAt, locale)}
                    </div>
                  </div>

                  {(() => {
                    const canDelete =
                      !isLocked &&
                      (currentMemberId === s.fromMemberId ||
                        currentMemberId === s.toMemberId ||
                        (Boolean(creatorMemberId) &&
                          currentMemberId === creatorMemberId));

                    if (!canDelete) return null;

                    return (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            id: s.id,
                            fromName: from?.displayName ?? "Member",
                            toName: to?.displayName ?? "Member",
                            amount: s.amount,
                          })
                        }
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-rose-200 bg-rose-50/50 px-3.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100/70 transition-all cursor-pointer active:scale-95"
                      >
                        <span>🗑️</span>
                        <span>{labels.deleteButton}</span>
                      </button>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Floating Delete Settlement Confirmation Toast */}
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
                    ? "এই লেনদেনটি মুছে ফেলতে চান?"
                    : "Delete this settlement?"}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  <span className="font-bold text-gray-950">
                    {pendingDelete.fromName} → {pendingDelete.toName}
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
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="rounded-full px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {locale === "bn" ? "বাতিল" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-black text-white shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
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
