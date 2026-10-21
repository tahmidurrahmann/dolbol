"use client";

import { useState } from "react";
import { updateMyProfileAction } from "@/app/trips/actions";
import { SelectField } from "@/components/SelectField";
import { toBanglaDigits } from "@/lib/format";
import { banglaToAsciiDigits } from "@/lib/names";

export interface MyProfileSettingsCardProps {
  slug: string;
  locale?: "bn" | "en";
  currentMember: {
    id: string;
    displayName: string;
    emoji: string | null;
    pinHash: string | null;
  };
  memberEmojis: readonly string[];
  labels: {
    cardTitle: string;
    nameLabel: string;
    pinLabel: string;
    saveButton: string;
    savingButton: string;
    pinActiveBadge: string;
    pinInactiveBadge: string;
    pinKeepCurrentHint: string;
    pinEmptyOptionalHint: string;
    explainerTitle: string;
    explainerIntro: string;
    explainerSecurity: string;
    explainerRecovery: string;
  };
}

export function MyProfileSettingsCard({
  slug,
  locale = "bn",
  currentMember,
  memberEmojis,
  labels,
}: MyProfileSettingsCardProps) {
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBn = locale === "bn";
  const hasPin = Boolean(currentMember.pinHash);

  const asciiDigits = banglaToAsciiDigits(pin).replace(/\D/g, "");
  const pinLength = asciiDigits.length;
  const isInvalidPin = pinLength > 0 && pinLength < 4;
  const canSubmit = !isSubmitting && !isInvalidPin;

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Restrict input to digits only (Bangla or English), capped at 6 digits
    const filtered = e.target.value.replace(/[^0-9০-৯]/g, "").slice(0, 6);
    setPin(filtered);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      e.preventDefault();
      return;
    }
    setIsSubmitting(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 sm:p-5 shadow-xs">
        <h2 className="mb-3.5 text-base sm:text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span aria-hidden="true">⚙️</span>
          <span>{labels.cardTitle}</span>
        </h2>

        <form
          action={updateMyProfileAction}
          onSubmit={handleSubmit}
          className="space-y-3.5"
        >
          <input type="hidden" name="slug" value={slug} />

          {/* Name & Emoji row */}
          <div className="space-y-1">
            <label
              htmlFor="my-name"
              className="block text-xs font-bold text-[var(--color-fg)]"
            >
              {labels.nameLabel}
            </label>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <SelectField
                id="my-emoji"
                name="emoji"
                emojiMode
                defaultValue={currentMember.emoji ?? "🎒"}
                options={memberEmojis.map((e) => ({
                  value: e,
                  label: e,
                }))}
              />
              <input
                id="my-name"
                name="displayName"
                type="text"
                required
                maxLength={40}
                defaultValue={currentMember.displayName}
                className="min-h-[40px] sm:min-h-[44px] flex-1 min-w-0 rounded-2xl border border-[var(--color-border)] bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* PIN Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="my-pin"
                className="block text-xs font-bold text-[var(--color-fg)]"
              >
                {labels.pinLabel}
              </label>

              {/* Status Badge */}
              {hasPin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
                  <span aria-hidden="true">🛡️</span>
                  <span>{labels.pinActiveBadge}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 shadow-2xs">
                  <span aria-hidden="true">🔓</span>
                  <span>{labels.pinInactiveBadge}</span>
                </span>
              )}
            </div>

            <input
              id="my-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9০-৯]{4,6}"
              maxLength={6}
              value={pin}
              onChange={handlePinChange}
              placeholder={
                hasPin
                  ? isBn
                    ? "•••• (নতুন পিন দিতে চাইলে লিখুন)"
                    : "•••• (enter new 4-6 digits to change)"
                  : isBn
                    ? "৪-৬ সংখ্যার গোপন পিন দিন"
                    : "Enter 4-6 digit secret PIN"
              }
              className={`min-h-[44px] w-full rounded-2xl border bg-white px-3.5 py-2 text-sm text-[var(--color-fg)] outline-none transition-all shadow-xs ${
                isInvalidPin
                  ? "border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20"
                  : pinLength >= 4
                    ? "border-emerald-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                    : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              }`}
            />

            {/* Live dynamic validation & status text */}
            <div className="min-h-[20px] text-xs">
              {pinLength === 0 ? (
                <p className="text-gray-500 text-[11px] sm:text-xs">
                  {hasPin
                    ? `💡 ${labels.pinKeepCurrentHint}`
                    : `💡 ${labels.pinEmptyOptionalHint}`}
                </p>
              ) : pinLength < 4 ? (
                <p className="flex items-center gap-1 font-semibold text-amber-600 text-[11px] sm:text-xs">
                  <span aria-hidden="true">⚠️</span>
                  <span>
                    {isBn
                      ? `কমপক্ষে ৪টি সংখ্যা প্রয়োজন (আরও ${toBanglaDigits(4 - pinLength)}টি বাকি)`
                      : `At least 4 digits required (${4 - pinLength} more needed)`}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1 font-bold text-emerald-700 text-[11px] sm:text-xs">
                  <span aria-hidden="true">✓</span>
                  <span>
                    {isBn
                      ? `${toBanglaDigits(pinLength)} ডিজিটের নতুন পিন প্রস্তুত`
                      : `${pinLength}-digit new PIN ready`}
                  </span>
                </p>
              )}
            </div>

            {/* Collapsible Explainer Box answering 'r pin er kaj ki' */}
            <details className="group rounded-2xl border border-emerald-500/25 bg-emerald-50/75 p-3 sm:p-3.5 text-emerald-950 shadow-2xs transition-all">
              <summary className="flex items-center gap-2 font-extrabold text-xs sm:text-sm text-emerald-900 cursor-pointer list-none select-none">
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-lg bg-emerald-200/80 text-sm shrink-0"
                >
                  💡
                </span>
                <span className="flex-1">{labels.explainerTitle}</span>
                <span className="text-xs text-emerald-700 transition-transform group-open:rotate-180">
                  ▼
                </span>
              </summary>
              <div className="pt-2.5 space-y-2">
                <p className="text-[11px] sm:text-xs text-emerald-800 leading-relaxed font-medium">
                  {labels.explainerIntro}
                </p>
                <ul className="space-y-1.5 text-[11px] sm:text-xs text-emerald-900 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 text-sm" aria-hidden="true">
                      🛡️
                    </span>
                    <span>{labels.explainerSecurity}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 text-sm" aria-hidden="true">
                      📱
                    </span>
                    <span>{labels.explainerRecovery}</span>
                  </li>
                </ul>
              </div>
            </details>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-gray-800 hover:bg-gray-50 shadow-2xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                <span>{labels.savingButton}</span>
              </>
            ) : (
              <span>{labels.saveButton}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
