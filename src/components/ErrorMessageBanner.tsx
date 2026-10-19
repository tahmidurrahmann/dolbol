"use client";

import { useEffect, useState, useCallback } from "react";

export interface ToastNotificationProps {
  message: string;
  variant?: "error" | "success";
  dismissLabel?: string;
  /** Auto-dismiss duration in milliseconds. Defaults to 5000 (5 seconds). */
  duration?: number;
  /** The URL query parameter to remove on dismiss. Defaults to 'error' for error variant and 'pinSaved' for success variant. */
  dismissParam?: string | null;
}

/**
 * Toast notification for application errors and success messages.
 * Floats at the top of the viewport, auto-dismisses after 5 seconds (configurable),
 * and cleans up the associated URL query parameter on dismiss.
 */
export function ToastNotification({
  message,
  variant = "error",
  dismissLabel,
  duration = 5000,
  dismissParam,
}: ToastNotificationProps) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  const isVisible = Boolean(message && dismissedMessage !== message);
  const effectiveDismissParam =
    dismissParam !== undefined
      ? dismissParam
      : variant === "success"
        ? "pinSaved"
        : "error";

  const handleDismiss = useCallback(() => {
    try {
      if (typeof window !== "undefined" && effectiveDismissParam) {
        const url = new URL(window.location.href);
        if (url.searchParams.has(effectiveDismissParam)) {
          url.searchParams.delete(effectiveDismissParam);
          const newSearch = url.searchParams.toString();
          const newUrl =
            url.pathname + (newSearch ? `?${newSearch}` : "") + url.hash;
          window.history.replaceState({}, "", newUrl);
        }
      }
    } catch {
      // Ignore URL replacement errors in testing or restricted environments
    }
    setDismissedMessage(message);
  }, [message, effectiveDismissParam]);

  // Auto-dismiss after 5 seconds (or specified duration)
  useEffect(() => {
    if (!message || dismissedMessage === message) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, handleDismiss, dismissedMessage]);

  if (!isVisible) {
    return null;
  }

  const isSuccess = variant === "success";

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      aria-live={isSuccess ? "polite" : "assertive"}
      className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md pointer-events-none select-none"
    >
      <div
        className={`pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl border bg-white/95 backdrop-blur-md shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-4 duration-300 ${
          isSuccess
            ? "border-emerald-300/90 text-emerald-950"
            : "border-red-200/90 text-red-950"
        }`}
      >
        <div className="flex items-start justify-between gap-3 p-3.5 sm:p-4 text-xs sm:text-sm font-semibold">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span
              aria-hidden="true"
              className={`flex size-7 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-2xs ${
                isSuccess
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {isSuccess ? "🛡️" : "⚠️"}
            </span>
            <div className="leading-relaxed break-words pt-0.5">{message}</div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={
              dismissLabel ??
              (isSuccess ? "Dismiss notification" : "Dismiss error")
            }
            title={
              dismissLabel ??
              (isSuccess ? "Dismiss notification" : "Dismiss error")
            }
            className={`shrink-0 flex size-7 items-center justify-center rounded-lg active:scale-95 transition-all cursor-pointer font-bold text-xs ${
              isSuccess
                ? "bg-emerald-100/70 text-emerald-800 hover:bg-emerald-200"
                : "bg-red-100/70 text-red-800 hover:bg-red-200"
            }`}
          >
            ✕
          </button>
        </div>

        {/* 5-second countdown progress bar */}
        <div
          className={`h-1 w-full overflow-hidden ${
            isSuccess ? "bg-emerald-100/80" : "bg-red-100/80"
          }`}
        >
          <div
            className={`h-full ${
              isSuccess ? "bg-emerald-500/80" : "bg-red-500/80"
            }`}
            style={{
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export const ErrorMessageBanner = ToastNotification;

