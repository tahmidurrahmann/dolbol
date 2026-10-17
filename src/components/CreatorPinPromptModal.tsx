"use client";

import { useState } from "react";
import { updateMyProfileAction } from "@/app/trips/actions";

interface CreatorPinPromptModalProps {
  slug: string;
  labels: {
    title: string;
    description: string;
    pinLabel: string;
    pinPlaceholder: string;
    saveButton: string;
    skipButton: string;
  };
}

export function CreatorPinPromptModal({
  slug,
  labels,
}: CreatorPinPromptModalProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (dismissed) {
    return null;
  }

  const handleSkip = () => {
    try {
      sessionStorage.setItem(`dismissed_creator_pin_${slug}`, "1");
    } catch {
      // Storage unavailable
    }
    setDismissed(true);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-3xl border-2 border-emerald-500/40 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl shrink-0">
            👑
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-[var(--color-fg)]">
              {labels.title}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              {labels.description}
            </p>
          </div>
        </div>

        <form
          action={updateMyProfileAction}
          onSubmit={() => setIsSubmitting(true)}
          className="space-y-3.5 pt-1"
        >
          <input type="hidden" name="slug" value={slug} />

          <div className="space-y-1.5">
            <label
              htmlFor="setup-creator-pin"
              className="block text-xs font-bold text-[var(--color-fg)]"
            >
              {labels.pinLabel}
            </label>
            <input
              id="setup-creator-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              placeholder={labels.pinPlaceholder}
              className="min-h-[46px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2 text-center text-lg tracking-widest text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 shadow-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSkip}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {labels.skipButton}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <span>🛡️ {labels.saveButton}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
