"use client";

import { useState } from "react";
import { clearAppOfflineCaches } from "@/lib/offline";
import type { SupportedLocale } from "@/lib/format";

export interface RemoveOfflineDataButtonProps {
  locale?: SupportedLocale;
  labels?: {
    buttonText?: string;
    confirmText?: string;
    successText?: string;
  };
  variant?: "button" | "menuItem";
}

export function RemoveOfflineDataButton({
  locale = "bn",
  labels,
  variant = "button",
}: RemoveOfflineDataButtonProps) {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const isBn = locale === "bn";
  const buttonText =
    labels?.buttonText ??
    (isBn ? "অফলাইন ডেটা মুছুন" : "Remove offline data");
  const successText =
    labels?.successText ??
    (isBn
      ? "✓ অফলাইন ডেটা মুছে ফেলা হয়েছে"
      : "✓ Offline data removed");

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearAppOfflineCaches();
      setCleared(true);
      setTimeout(() => setCleared(false), 4000);
    } catch (err) {
      console.error("Failed to clear offline caches:", err);
    } finally {
      setClearing(false);
    }
  };

  if (cleared) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
        {successText}
      </span>
    );
  }

  if (variant === "menuItem") {
    return (
      <button
        type="button"
        disabled={clearing}
        onClick={handleClear}
        className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
      >
        <span aria-hidden="true">🗑️</span>
        <span>{clearing ? (isBn ? "মুছে ফেলা হচ্ছে..." : "Clearing...") : buttonText}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={clearing}
      onClick={handleClear}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-red-300 hover:bg-red-50/50 hover:text-red-700 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
    >
      <span aria-hidden="true">🗑️</span>
      <span>{clearing ? (isBn ? "মুছে ফেলা হচ্ছে..." : "Clearing...") : buttonText}</span>
    </button>
  );
}
