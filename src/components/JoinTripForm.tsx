"use client";

import { useState } from "react";
import { lookupTripByLinkAction } from "@/app/trips/actions";
import { Button } from "@/components/Button";
import type { SupportedLocale } from "@/lib/format";

interface JoinTripFormProps {
  locale: SupportedLocale;
  labels: {
    inputLabel: string;
    inputPlaceholder: string;
    submitButton: string;
  };
}

export function JoinTripForm({ locale, labels }: JoinTripFormProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isBn = locale === "bn";
  const trimmed = value.trim();
  const error =
    touched && !trimmed
      ? isBn
        ? "ট্রিপ লিংক বা স্লাগ কোড দেওয়া আবশ্যক।"
        : "Trip link or slug code is required."
      : null;

  async function handlePaste() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setValue(text.trim());
          setTouched(true);
        }
      }
    } catch {
      // Ignore clipboard permission errors
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!trimmed) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form
      action={lookupTripByLinkAction}
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6"
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="tripLinkOrSlug"
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {labels.inputLabel.replace(/\s*\*$/, "")}
            <span className="ml-1 font-bold text-red-500">*</span>
          </label>
          <span className="text-xs text-[var(--color-fg-muted)]">
            {isBn ? "আবশ্যক" : "Required"}
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            id="tripLinkOrSlug"
            name="tripLinkOrSlug"
            type="text"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={labels.inputPlaceholder}
            className={`min-h-[48px] w-full rounded-xl border bg-white pl-3.5 pr-24 py-2.5 text-base text-[var(--color-fg)] shadow-xs transition-all outline-none ${
              error
                ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
                : "border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            }`}
          />
          <button
            type="button"
            onClick={handlePaste}
            className="absolute right-2 inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-border)] active:scale-95 transition-all"
          >
            <span>📋</span>
            <span>{isBn ? "পেস্ট" : "Paste"}</span>
          </button>
        </div>

        {error ? (
          <p className="flex items-center gap-1 text-xs font-medium text-red-600">
            <span>⚠️</span>
            <span>{error}</span>
          </p>
        ) : (
          <p className="text-xs text-[var(--color-fg-muted)]">
            💡{" "}
            {isBn
              ? "পুরো লিংক (যেমন https://.../trips/sajek-tour) বা শুধু স্লাগ কোড পেস্ট করতে পারেন।"
              : "You can paste the entire URL or just the trip slug code."}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="w-full min-h-[50px] text-base font-extrabold transition-all"
      >
        {submitting
          ? isBn
            ? "🔍 খোঁজা হচ্ছে..."
            : "🔍 Searching..."
          : `🔍 ${labels.submitButton}`}
      </Button>
    </form>
  );
}
