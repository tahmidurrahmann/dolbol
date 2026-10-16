"use client";

import { useState } from "react";

interface ShareLinkCardProps {
  slug: string;

  tripName: string;

  shareTitle: string;

  shareSubtitle: string;

  copyLabel: string;

  copiedLabel: string;

  shareNativeLabel: string;
}

export function ShareLinkCard({
  slug,

  tripName,

  shareTitle,

  shareSubtitle,

  copyLabel,

  copiedLabel,

  shareNativeLabel,
}: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const relativePath = `/trips/${slug}`;

  function getFullUrl(): string {
    if (typeof window === "undefined") {
      return relativePath;
    }

    return `${window.location.origin}${relativePath}`;
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(getFullUrl());

      setCopied(true);

      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard permission denied
    }
  }

  async function handleNativeShare(): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: tripName,

          url: getFullUrl(),
        });
      } catch {
        // User cancelled share sheet
      }
    } else {
      await handleCopy();
    }
  }

  return (
    <div className="space-y-3.5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🔗</span>
          <span>{shareTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400">{shareSubtitle}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 font-mono text-sm text-[var(--color-primary)] font-medium shadow-2xs">
        {relativePath}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-gray-300 px-3 py-2 text-sm font-bold transition-all active:scale-95 cursor-pointer ${
            copied
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-white text-gray-800 hover:bg-gray-50 shadow-2xs"
          }`}
        >
          <span>{copied ? "✓" : "📋"}</span>
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-3 py-2 text-sm font-bold text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all cursor-pointer"
        >
          <span>📤</span>
          <span>{shareNativeLabel}</span>
        </button>
      </div>
    </div>
  );
}
