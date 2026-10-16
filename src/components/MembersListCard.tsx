"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMemberAction } from "@/app/trips/actions";
import type { SupportedLocale } from "@/lib/format";

export interface MemberListItem {
  id: string;
  displayName: string;
  emoji: string | null;
  isGuest: boolean;
  sessionsCount: number;
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
}

interface MembersListCardProps {
  slug: string;
  locale: SupportedLocale;
  isCreator: boolean;
  creatorMemberId?: string | null;
  members: MemberListItem[];
  membersWithTransactions: string[];
  labels: MembersListCardLabels;
}

export function MembersListCard({
  slug,
  locale: _locale,
  isCreator,
  creatorMemberId,
  members,
  membersWithTransactions,
  labels,
}: MembersListCardProps) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    displayName: string;
    emoji: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const transactionsSet = new Set(membersWithTransactions);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("memberId", target.id);
      await deleteMemberAction(formData);
    } catch {
      // Handled by Next.js redirect
    } finally {
      setIsDeleting(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.heading} ({members.length})
        </h2>
      </div>

      <ul className="divide-y divide-[var(--color-border)]">
        {members.map((member) => {
          const isTripCreator = member.id === creatorMemberId;
          const hasTransactions = transactionsSet.has(member.id);
          const canDelete = isCreator && !isTripCreator && !hasTransactions;

          return (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 py-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-xl">
                  {member.emoji ?? "🎒"}
                </span>
                <span className="font-bold text-[var(--color-fg)] truncate">
                  {member.displayName}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isTripCreator ? (
                  <span className="rounded-md bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
                    {labels.creatorBadge}
                  </span>
                ) : null}

                {member.isGuest ? (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                    {labels.guestBadge}
                  </span>
                ) : null}

                {member.sessionsCount > 0 ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                    ✓ {labels.joinedBadge}
                  </span>
                ) : null}

                {isCreator && !isTripCreator && hasTransactions ? (
                  <span
                    title={labels.hasTransactionsBadge}
                    className="hidden sm:inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 border border-neutral-200/80"
                  >
                    ৳ {labels.hasTransactionsBadge}
                  </span>
                ) : null}

                {canDelete ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDelete({
                        id: member.id,
                        displayName: member.displayName,
                        emoji: member.emoji ?? "🎒",
                      })
                    }
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-rose-200 bg-rose-50/60 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-all cursor-pointer active:scale-95"
                  >
                    <span>🗑️</span>
                    <span>{labels.deleteButton}</span>
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Floating Delete Member Confirmation Toast */}
      {pendingDelete ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed bottom-20 min-[1000px]:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="rounded-2xl border border-rose-200 bg-white/95 p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5 ring-1 ring-black/5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 text-lg">
                🗑️
              </span>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-gray-900">
                  {labels.confirmDeleteTitle}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {labels.confirmDeleteDesc}
                </p>
                <div className="pt-1 flex items-center gap-2 text-xs font-bold text-gray-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-sm">
                    {pendingDelete.emoji}
                  </span>
                  <span>{pendingDelete.displayName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {labels.cancelButton}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
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
