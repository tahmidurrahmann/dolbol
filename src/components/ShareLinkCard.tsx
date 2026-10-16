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
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🔗</span>
          <span>{shareTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">{shareSubtitle}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 font-mono text-sm text-[var(--color-primary)] font-medium shadow-2xs">
        {relativePath}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-bold transition-all active:scale-95 ${
            copied
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-white text-[var(--color-fg)] hover:bg-[var(--color-surface-muted)]"
          }`}
        >
          <span>{copied ? "✓" : "📋"}</span>
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
        >
          <span>📤</span>
          <span>{shareNativeLabel}</span>
        </button>
      </div>
    </div>
  );
}
