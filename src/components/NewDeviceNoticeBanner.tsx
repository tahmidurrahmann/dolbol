"use client";

import { useState, useSyncExternalStore } from "react";

interface NewDeviceNoticeBannerProps {
  logId: string;
  message: string;
  dismissLabel: string;
}

const emptySubscribe = () => () => {};

export function NewDeviceNoticeBanner({
  logId,
  message,
  dismissLabel,
}: NewDeviceNoticeBannerProps) {
  const [userDismissed, setUserDismissed] = useState(false);

  const isStoredDismissed = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return sessionStorage.getItem(`dismissed_claim_${logId}`) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );

  if (userDismissed || isStoredDismissed) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`dismissed_claim_${logId}`, "1");
    } catch {
      // Storage unavailable
    }
    setUserDismissed(true);
  };

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm font-semibold text-amber-950 shadow-xs animate-in fade-in duration-200"
    >
      <div className="flex items-start gap-2.5">
        <span className="text-lg shrink-0">📱</span>
        <p className="leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-xl bg-amber-200/70 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 transition-colors cursor-pointer active:scale-95"
      >
        {dismissLabel}
      </button>
    </div>
  );
}
