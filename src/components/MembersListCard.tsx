"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMemberAction, resetMemberDevicesAction } from "@/app/trips/actions";
import {
  formatRelativeTime,
  toBanglaDigits,
  type SupportedLocale,
} from "@/lib/format";

export interface MemberListItem {
  id: string;
  displayName: string;
  emoji: string | null;
  isGuest: boolean;
  sessionsCount: number;
  lastClaimedAt?: Date | string | null;
}

interface MembersListCardLabels {
  heading: string;
  creatorBadge: string;
  guestBadge: string;
  joinedBadge: string;
  hasTransactionsBadge: string;
  deleteButton: string;
  confirmDeleteTitle: string;
  confirmDeleteDesc: string;
  cancelButton: string;
  confirmDeleteButton: string;
  deletingButton: string;
  resetDevicesButton?: string;
  confirmResetDevicesTitle?: string;
  confirmResetDevicesDesc?: string;
  confirmResetDevicesButton?: string;
  resettingDevicesButton?: string;
  creatorPinPrompt?: string;
  creatorPinPlaceholder?: string;
  devicesCountLabel?: string;
  lastClaimedPrefix?: string;
}

interface MembersListCardProps {
  slug: string;
  locale: SupportedLocale;
  isCreator: boolean;
  creatorNeedsPin?: boolean;
  creatorMemberId?: string | null;
  members: MemberListItem[];
  membersWithTransactions: string[];
  labels: MembersListCardLabels;
}

export function MembersListCard({
  slug,
  locale,
  isCreator,
  creatorNeedsPin = false,
  creatorMemberId,
  members,
  membersWithTransactions,
  labels,
}: MembersListCardProps) {
  const router = useRouter();
  const [creatorPin, setCreatorPin] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    displayName: string;
    emoji: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [pendingResetDevices, setPendingResetDevices] = useState<{
    id: string;
    displayName: string;
    emoji: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const transactionsSet = new Set(membersWithTransactions);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    if (creatorNeedsPin && !creatorPin.trim()) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("memberId", target.id);
      if (creatorNeedsPin && creatorPin.trim()) {
        formData.append("creatorPin", creatorPin.trim());
      }
      await deleteMemberAction(formData);
    } catch {
      // Handled by Next.js redirect
    } finally {
      setIsDeleting(false);
      setCreatorPin("");
      router.refresh();
    }
  };

  const handleConfirmResetDevices = async () => {
    if (!pendingResetDevices || isResetting) return;
    if (creatorNeedsPin && !creatorPin.trim()) return;
    const target = pendingResetDevices;
    setPendingResetDevices(null);
    setIsResetting(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("memberId", target.id);
      if (creatorNeedsPin && creatorPin.trim()) {
        formData.append("creatorPin", creatorPin.trim());
      }
      await resetMemberDevicesAction(formData);
    } catch {
      // Handled by Next.js redirect
    } finally {
      setIsResetting(false);
      setCreatorPin("");
      router.refresh();
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-[var(--color-fg)]">
          {labels.heading} ({members.length})
        </h2>
      </div>

      <ul className="divide-y divide-[var(--color-border)]">
        {members.map((member) => {
          const isTripCreator = member.id === creatorMemberId;
          const hasTransactions = transactionsSet.has(member.id);
          const canDelete = isCreator && !isTripCreator && !hasTransactions;
          const hasActions = isCreator && !isTripCreator && (member.sessionsCount > 0 || canDelete);

          return (
            <li
              key={member.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 py-3"
            >
              {/* Member identity & badges */}
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-xl">
                  {member.emoji ?? "🎒"}
                </span>

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                    <span className="font-bold text-[var(--color-fg)] text-sm sm:text-base break-words">
                      {member.displayName}
                    </span>

                    {isTripCreator ? (
                      <span className="rounded-md bg-[var(--color-primary-light)] px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-[var(--color-primary)]">
                        {labels.creatorBadge}
                      </span>
                    ) : null}

                    {member.isGuest ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold text-amber-900 border border-amber-200">
                        {labels.guestBadge}
                      </span>
                    ) : null}

                    {member.sessionsCount > 0 ? (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-800 border border-emerald-200">
                        ✓ {labels.joinedBadge}
                      </span>
                    ) : null}

                    {isCreator && !isTripCreator && hasTransactions ? (
                      <span
                        title={labels.hasTransactionsBadge}
                        className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-neutral-500 border border-neutral-200/80"
                      >
                        ৳ {labels.hasTransactionsBadge}
                      </span>
                    ) : null}
                  </div>

                  {isCreator && member.sessionsCount > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px] text-neutral-500 pt-1">
                      <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
                        📱{" "}
                        {locale === "bn"
                          ? `${toBanglaDigits(member.sessionsCount)}${labels.devicesCountLabel ?? "টি ডিভাইস"}`
                          : `${member.sessionsCount} ${labels.devicesCountLabel ?? "device(s)"}`}
                      </span>
                      {member.lastClaimedAt ? (
                        <span className="text-[10px] text-neutral-400">
                          {labels.lastClaimedPrefix ?? (locale === "bn" ? "শেষ সক্রিয়" : "Last claimed")}:{" "}
                          {formatRelativeTime(new Date(member.lastClaimedAt), locale)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Action buttons (Reset devices, Delete) */}
              {hasActions ? (
                <div className="flex flex-wrap items-center gap-1.5 pl-[46px] sm:pl-0 shrink-0">
                  {member.sessionsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatorPin("");
                        setPendingResetDevices({
                          id: member.id,
                          displayName: member.displayName,
                          emoji: member.emoji ?? "🎒",
                        });
                      }}
                      title={labels.resetDevicesButton ?? "Reset devices"}
                      className="inline-flex min-h-[30px] sm:min-h-[34px] items-center gap-1 rounded-full border border-amber-300 bg-amber-50/70 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold text-amber-900 hover:bg-amber-100 transition-all cursor-pointer active:scale-95"
                    >
                      <span>📱</span>
                      <span>{labels.resetDevicesButton ?? "Reset devices"}</span>
                    </button>
                  ) : null}

                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatorPin("");
                        setPendingDelete({
                          id: member.id,
                          displayName: member.displayName,
                          emoji: member.emoji ?? "🎒",
                        });
                      }}
                      className="inline-flex min-h-[30px] sm:min-h-[34px] items-center gap-1 rounded-full border border-rose-200 bg-rose-50/60 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-rose-700 hover:bg-rose-100 transition-all cursor-pointer active:scale-95"
                    >
                      <span>🗑️</span>
                      <span>{labels.deleteButton}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Floating Reset Member Devices Confirmation Toast */}
      {pendingResetDevices ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed bottom-20 min-[1000px]:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="rounded-2xl border border-amber-300 bg-white/95 p-3.5 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5 ring-1 ring-black/5">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-base sm:text-lg">
                📱
              </span>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-bold text-gray-900">
                  {labels.confirmResetDevicesTitle ?? "Reset member's devices?"}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {labels.confirmResetDevicesDesc ?? "All active devices will be signed out."}
                </p>
                <div className="pt-1 flex items-center gap-2 text-xs font-bold text-gray-800">
                  <span className="flex size-6 items-center justify-center rounded-md bg-neutral-100 text-sm">
                    {pendingResetDevices.emoji}
                  </span>
                  <span className="truncate">{pendingResetDevices.displayName}</span>
                </div>
              </div>
            </div>

            {creatorNeedsPin ? (
              <div className="space-y-1.5 pt-1 text-left">
                <label className="block text-xs font-semibold text-gray-700">
                  {labels.creatorPinPrompt ?? (locale === "bn" ? "নিশ্চিত করতে আপনার পিন দিন" : "Enter your PIN to confirm")}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={creatorPin}
                  onChange={(e) => setCreatorPin(e.target.value)}
                  placeholder={labels.creatorPinPlaceholder ?? (locale === "bn" ? "৪-৬ ডিজিটের পিন" : "4-6 digit PIN")}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-100">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => {
                  setPendingResetDevices(null);
                  setCreatorPin("");
                }}
                className="inline-flex min-h-[36px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center rounded-xl border border-gray-300 bg-white px-3 sm:px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {labels.cancelButton}
              </button>
              <button
                type="button"
                disabled={isResetting || (creatorNeedsPin && !creatorPin.trim())}
                onClick={handleConfirmResetDevices}
                className="inline-flex min-h-[36px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 sm:px-4 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{labels.resettingDevicesButton ?? "Resetting..."}</span>
                  </>
                ) : (
                  <>
                    <span>📱</span>
                    <span>{labels.confirmResetDevicesButton ?? "Reset devices"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Delete Member Confirmation Toast */}
      {pendingDelete ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed bottom-20 min-[1000px]:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="rounded-2xl border border-rose-200 bg-white/95 p-3.5 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5 ring-1 ring-black/5">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 text-base sm:text-lg">
                🗑️
              </span>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-bold text-gray-900">
                  {labels.confirmDeleteTitle}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {labels.confirmDeleteDesc}
                </p>
                <div className="pt-1 flex items-center gap-2 text-xs font-bold text-gray-800">
                  <span className="flex size-6 items-center justify-center rounded-md bg-neutral-100 text-sm">
                    {pendingDelete.emoji}
                  </span>
                  <span className="truncate">{pendingDelete.displayName}</span>
                </div>
              </div>
            </div>

            {creatorNeedsPin ? (
              <div className="space-y-1.5 pt-1 text-left">
                <label className="block text-xs font-semibold text-gray-700">
                  {labels.creatorPinPrompt ?? (locale === "bn" ? "নিশ্চিত করতে আপনার পিন দিন" : "Enter your PIN to confirm")}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={creatorPin}
                  onChange={(e) => setCreatorPin(e.target.value)}
                  placeholder={labels.creatorPinPlaceholder ?? (locale === "bn" ? "৪-৬ ডিজিটের পিন" : "4-6 digit PIN")}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setPendingDelete(null);
                  setCreatorPin("");
                }}
                className="inline-flex min-h-[36px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center rounded-xl border border-gray-300 bg-white px-3 sm:px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {labels.cancelButton}
              </button>
              <button
                type="button"
                disabled={isDeleting || (creatorNeedsPin && !creatorPin.trim())}
                onClick={handleConfirmDelete}
                className="inline-flex min-h-[36px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 sm:px-4 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{labels.deletingButton}</span>
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>{labels.confirmDeleteButton}</span>
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
