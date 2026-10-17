"use client";

import { useState } from "react";

interface ErrorMessageBannerProps {
  message: string;
  dismissLabel?: string;
}

export function ErrorMessageBanner({
  message,
  dismissLabel,
}: ErrorMessageBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !message) {
    return null;
  }

  const handleDismiss = () => {
    try {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("error")) {
          url.searchParams.delete("error");
          window.history.replaceState(
            {},
            "",
            url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash,
          );
        }
      }
    } catch {
      // Ignore URL replacement errors in testing or restricted environments
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 p-3.5 sm:p-4 text-xs sm:text-sm font-medium text-red-900 shadow-2xs animate-in fade-in duration-150"
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className="text-base sm:text-lg shrink-0 select-none">⚠️</span>
        <div className="leading-relaxed break-words pt-0.5">{message}</div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={dismissLabel ?? "Dismiss error"}
        title={dismissLabel ?? "Dismiss error"}
        className="shrink-0 flex size-7 items-center justify-center rounded-lg bg-red-200/60 text-red-800 hover:bg-red-200 active:scale-95 transition-all cursor-pointer font-bold text-sm select-none"
      >
        ✕
      </button>
    </div>
  );
}
