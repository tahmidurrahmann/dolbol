"use client";

import { useId, useRef } from "react";
import { formatDate, type SupportedLocale } from "@/lib/format";
import { dayKey } from "@/lib/time";

interface DatePickerFieldProps {
  id?: string;
  name: string;
  value: string; // YYYY-MM-DD
  onChange?: (val: string) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  locale?: SupportedLocale;
  showQuickPills?: boolean;
  min?: string;
  max?: string;
  className?: string;
  helperText?: string;
}

export function DatePickerField({
  id: explicitId,
  name,
  value,
  onChange,
  label,
  required = false,
  error = null,
  locale = "bn",
  showQuickPills = true,
  min,
  max,
  className = "",
  helperText,
}: DatePickerFieldProps) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  function handleContainerClick() {
    // Attempt to open the native calendar popup on modern browsers
    try {
      const el = inputRef.current;
      if (!el) return;
      if (typeof (el as unknown as { showPicker?: () => void }).showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  }

  function handleQuickSet(target: "today" | "yesterday") {
    const now = new Date();
    const targetDate =
      target === "today" ? now : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = dayKey(targetDate);
    if (onChange) {
      onChange(dateStr);
    } else if (inputRef.current) {
      inputRef.current.value = dateStr;
      inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Format a human-readable preview of the selected date
  let formattedPreview = "";
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      const parsed = new Date(`${value}T12:00:00+06:00`);
      if (!Number.isNaN(parsed.getTime())) {
        formattedPreview = formatDate(parsed, locale);
      }
    } catch {
      formattedPreview = "";
    }
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {label}
            {required ? (
              <span className="ml-1 font-bold text-red-500" title="Required">*</span>
            ) : null}
          </label>
          {formattedPreview ? (
            <span className="truncate rounded-md bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
              📅 {formattedPreview}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        onClick={handleContainerClick}
        className={`relative flex min-h-[46px] cursor-pointer items-center rounded-xl border bg-white px-3.5 py-1.5 shadow-xs transition-all ${
          error
            ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
            : "border-[var(--color-border)] hover:border-[var(--color-primary)]/60 focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20"
        }`}
      >
        <span className="mr-2.5 text-lg text-[var(--color-fg-muted)] select-none">
          🗓️
        </span>

        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="date"
          required={required}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          min={min}
          max={max}
          className="w-full cursor-pointer bg-transparent text-base font-medium text-[var(--color-fg)] outline-none"
        />
      </div>

      {showQuickPills ? (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-[var(--color-fg-muted)]">
            {locale === "bn" ? "দ্রুত বাছুন:" : "Quick pick:"}
          </span>
          <button
            type="button"
            onClick={() => handleQuickSet("today")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-fg)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/40 hover:text-[var(--color-primary)] transition-colors active:scale-95"
          >
            {locale === "bn" ? "+ আজ" : "+ Today"}
          </button>
          <button
            type="button"
            onClick={() => handleQuickSet("yesterday")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-fg)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/40 hover:text-[var(--color-primary)] transition-colors active:scale-95"
          >
            {locale === "bn" ? "+ গতকাল" : "+ Yesterday"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-red-600">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-[var(--color-fg-muted)]">{helperText}</p>
      ) : null}
    </div>
  );
}
