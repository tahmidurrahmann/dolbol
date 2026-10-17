"use client";

import { useState, useSyncExternalStore } from "react";

interface SoftPinPromptCardProps {
  memberId: string;
  title: string;
  body: string;
  actionLabel: string;
  dismissLabel: string;
}

const emptySubscribe = () => () => {};

export function SoftPinPromptCard({
  memberId,
  title,
  body,
  actionLabel,
  dismissLabel,
}: SoftPinPromptCardProps) {
  const [userDismissed, setUserDismissed] = useState(false);

  const isStoredDismissed = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return (
          sessionStorage.getItem(`dismissed_soft_pin_${memberId}`) === "1"
        );
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
      sessionStorage.setItem(`dismissed_soft_pin_${memberId}`, "1");
    } catch {
      // Storage unavailable
    }
    setUserDismissed(true);
  };

  const scrollToPin = () => {
    const pinInput = document.getElementById("my-pin");
    if (pinInput) {
      pinInput.focus();
      pinInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sky-950 shadow-xs animate-in fade-in duration-200">
      <div className="flex items-start gap-2.5">
        <span className="text-xl shrink-0">🛡️</span>
        <div className="space-y-1">
          <h3 className="text-xs sm:text-sm font-extrabold text-sky-900">{title}</h3>
          <p className="text-xs text-sky-800 leading-relaxed">{body}</p>
          <button
            type="button"
            onClick={scrollToPin}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-700 transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <span>🔑</span>
            <span>{actionLabel}</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-sky-700 hover:text-sky-900 p-1 text-sm font-bold cursor-pointer"
        aria-label={dismissLabel}
      >
        ✕
      </button>
    </div>
  );
}
