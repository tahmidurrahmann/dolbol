"use client";

import { useState } from "react";
import {
  claimExistingMemberAction,
  reclaimMemberAction,
} from "@/app/trips/actions";
import type { SupportedLocale } from "@/lib/format";

export interface ClaimedMemberItem {
  id: string;
  displayName: string;
  emoji: string | null;
  hasPin: boolean;
  isGuest: boolean;
}

interface ClaimMemberSectionProps {
  slug: string;
  locale: SupportedLocale;
  claimedMembers: ClaimedMemberItem[];
  labels: {
    heading: string;
    claimedBadge: string;
    thisIsMeButton: string;
    pinModalTitle: string;
    pinModalPrompt: string;
    pinPlaceholder: string;
    pinSubmitButton: string;
    cancelButton: string;
    confirmModalTitle: string;
    confirmModalBody: string;
    confirmContinueButton: string;
  };
}

export function ClaimMemberSection({
  slug,
  locale,
  claimedMembers,
  labels,
}: ClaimMemberSectionProps) {
  const [pinTarget, setPinTarget] = useState<ClaimedMemberItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ClaimedMemberItem | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (claimedMembers.length === 0) {
    return null;
  }

  const handleClaimClick = (member: ClaimedMemberItem) => {
    if (member.hasPin) {
      setPinTarget(member);
      setConfirmTarget(null);
    } else {
      setConfirmTarget(member);
      setPinTarget(null);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 sm:p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-sm sm:text-base font-extrabold text-[var(--color-fg)] flex items-center gap-2">
          <span className="shrink-0">👥</span>
          <span className="break-words">{labels.heading}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-2.5 pt-1">
        {claimedMembers.map((member) => (
          <div
            key={member.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 p-3 sm:px-4 sm:py-3.5 text-sm sm:text-base font-bold text-[var(--color-fg)]"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <span className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-xl sm:text-2xl border border-[var(--color-border)] shrink-0">
                {member.emoji ?? "🎒"}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="truncate text-sm sm:text-base font-extrabold text-[var(--color-fg)]">
                    {member.displayName}
                  </span>
                  {member.hasPin ? (
                    <span
                      title="PIN protected"
                      className="text-xs text-[var(--color-fg-muted)] shrink-0"
                    >
                      🔒
                    </span>
                  ) : null}
                  {member.isGuest ? (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 shrink-0">
                      {locale === "bn" ? "গেস্ট" : "Guest"}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 pt-0.5">
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-800 border border-emerald-200">
                    ✓ {labels.claimedBadge}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleClaimClick(member)}
              className="w-full sm:w-auto inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl sm:rounded-full border border-[var(--color-border)] bg-white px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold text-[var(--color-fg)] shadow-2xs shrink-0 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              <span>📱</span>
              <span>{labels.thisIsMeButton}</span>
            </button>
          </div>
        ))}
      </div>

      {/* PIN Prompt Modal */}
      {pinTarget ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 sm:size-12 items-center justify-center rounded-2xl bg-[var(--color-primary-light)]/40 text-xl sm:text-2xl border border-[var(--color-primary)]/20 shrink-0">
                {pinTarget.emoji ?? "🎒"}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-fg)] truncate">
                  {labels.pinModalTitle}
                </h3>
                <p className="text-xs text-[var(--color-fg-muted)] truncate">
                  {pinTarget.displayName}
                </p>
              </div>
            </div>

            <form
              action={reclaimMemberAction}
              onSubmit={() => setIsSubmitting(true)}
              className="space-y-3.5 pt-1"
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="memberId" value={pinTarget.id} />

              <div className="space-y-1.5">
                <label
                  htmlFor="claim-pin-input"
                  className="block text-xs font-bold text-[var(--color-fg)]"
                >
                  {labels.pinModalPrompt}
                </label>
                <input
                  id="claim-pin-input"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  required
                  autoFocus
                  maxLength={6}
                  placeholder={labels.pinPlaceholder}
                  className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-center text-lg tracking-widest text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 shadow-xs"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setPinTarget(null)}
                  className="w-full sm:w-auto inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {labels.cancelButton}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <span>🔑 {labels.pinSubmitButton}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* No-PIN Plain-Language Confirmation Modal */}
      {confirmTarget ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm rounded-3xl border border-amber-200 bg-white p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 sm:size-12 items-center justify-center rounded-2xl bg-amber-100 text-xl sm:text-2xl shrink-0">
                {confirmTarget.emoji ?? "🎒"}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-fg)] truncate">
                  {labels.confirmModalTitle}
                </h3>
                <p className="text-xs text-[var(--color-fg-muted)] truncate">
                  {confirmTarget.displayName}
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed bg-amber-50/80 p-3 sm:p-3.5 rounded-2xl border border-amber-200/80 break-words">
              {labels.confirmModalBody}
            </p>

            <form
              action={claimExistingMemberAction}
              onSubmit={() => setIsSubmitting(true)}
              className="pt-1 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2"
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="memberId" value={confirmTarget.id} />

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmTarget(null)}
                className="w-full sm:w-auto inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {labels.cancelButton}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span>✓ {labels.confirmContinueButton}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
