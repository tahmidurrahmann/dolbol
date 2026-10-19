"use client";

import { useState } from "react";
import { updateMyProfileAction } from "@/app/trips/actions";
import { toBanglaDigits } from "@/lib/format";
import { banglaToAsciiDigits } from "@/lib/names";

interface CreatorPinPromptModalProps {
  slug: string;
  locale?: "bn" | "en";
  labels: {
    title: string;
    description: string;
    pinLabel: string;
    pinPlaceholder: string;
    saveButton: string;
    skipButton: string;
    explainerTitle?: string;
    explainerIntro?: string;
    explainerControl?: string;
    explainerRecovery?: string;
  };
}

export function CreatorPinPromptModal({
  slug,
  locale = "bn",
  labels,
}: CreatorPinPromptModalProps) {
  const [pin, setPin] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBn = locale === "bn";
  const asciiDigits = banglaToAsciiDigits(pin).replace(/\D/g, "");
  const pinLength = asciiDigits.length;
  const isValidPin = pinLength >= 4 && pinLength <= 6;

  if (dismissed) {
    return null;
  }

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Restrict input to digits only (Bangla or English), capped at 6 digits
    const filtered = e.target.value.replace(/[^0-9০-৯]/g, "").slice(0, 6);
    setPin(filtered);
  };

  const handleSkip = () => {
    try {
      sessionStorage.setItem(`dismissed_creator_pin_${slug}`, "1");
    } catch {
      // Storage unavailable
    }
    setDismissed(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!isValidPin) {
      e.preventDefault();
      return;
    }
    setIsSubmitting(true);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-3xl border-2 border-emerald-500/40 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl shrink-0"
          >
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

        {/* Clear explainer box answering "r pin er kaj ki" */}
        <div className="rounded-2xl border-2 border-emerald-500/25 bg-emerald-50/75 p-3.5 sm:p-4 space-y-2.5 text-xs text-emerald-950 shadow-2xs">
          <div className="font-extrabold flex items-center gap-2 text-xs sm:text-sm text-emerald-900">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-lg bg-emerald-200/80 text-sm"
            >
              💡
            </span>
            <span>
              {labels.explainerTitle ??
                (isBn ? "পিনের কাজ কী? কেন প্রয়োজন?" : "What is this PIN for?")}
            </span>
          </div>
          {labels.explainerIntro ? (
            <p className="text-[11px] sm:text-xs text-emerald-800 leading-relaxed font-medium">
              {labels.explainerIntro}
            </p>
          ) : null}
          <ul className="space-y-2 text-[11px] sm:text-xs text-emerald-900 font-medium">
            <li className="flex items-start gap-2">
              <span className="shrink-0 text-sm" aria-hidden="true">
                👑
              </span>
              <span>
                {labels.explainerControl ??
                  (isBn
                    ? "ক্রিয়েটর ক্ষমতা রক্ষা: অন্য কেউ যাতে ট্রিপ লক করতে বা সদস্য মুছতে না পারে।"
                    : "Creator controls: Prevents others from locking the trip or deleting members.")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="shrink-0 text-sm" aria-hidden="true">
                📱
              </span>
              <span>
                {labels.explainerRecovery ??
                  (isBn
                    ? "ডিভাইস রিকভারি: ফোন বদলালে বা ব্রাউজার ডেটা মুছে গেলেও এই পিন দিয়ে ক্রিয়েটর হিসেবে ফেরত আসতে পারবেন।"
                    : "Device recovery: Reclaim your creator access if you switch phones or clear browser data.")}
              </span>
            </li>
          </ul>
        </div>

        <form
          action={updateMyProfileAction}
          onSubmit={handleSubmit}
          className="space-y-3.5 pt-1"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="isCreatorPinSetup" value="1" />

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
              pattern="[0-9০-৯]{4,6}"
              maxLength={6}
              required
              autoFocus
              value={pin}
              onChange={handlePinChange}
              placeholder={labels.pinPlaceholder}
              className={`min-h-[48px] w-full rounded-xl border bg-white px-3.5 py-2 text-center text-xl font-bold tracking-widest text-[var(--color-fg)] outline-none transition-all shadow-xs ${
                pinLength > 0 && !isValidPin
                  ? "border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20"
                  : isValidPin
                    ? "border-emerald-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                    : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              }`}
            />

            <div className="min-h-[20px] text-xs pt-0.5">
              {pinLength === 0 ? (
                <p className="text-neutral-400">
                  💡 {labels.pinPlaceholder}
                </p>
              ) : pinLength < 4 ? (
                <p className="flex items-center gap-1 font-semibold text-amber-600">
                  <span aria-hidden="true">⚠️</span>
                  <span>
                    {isBn
                      ? `কমপক্ষে ৪টি সংখ্যা প্রয়োজন (আরও ${toBanglaDigits(4 - pinLength)}টি বাকি)`
                      : `At least 4 digits required (${4 - pinLength} more needed)`}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1 font-bold text-emerald-700">
                  <span aria-hidden="true">✓</span>
                  <span>
                    {isBn
                      ? `${toBanglaDigits(pinLength)} ডিজিটের পিন প্রস্তুত`
                      : `${pinLength}-digit PIN ready`}
                  </span>
                </p>
              )}
            </div>
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
              disabled={isSubmitting || !isValidPin}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
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
