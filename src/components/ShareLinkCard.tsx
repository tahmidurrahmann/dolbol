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
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-[var(--color-fg)]">
          {shareTitle}
        </h2>

        <p className="text-sm text-[var(--color-fg-muted)]">{shareSubtitle}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 font-mono text-sm text-[var(--color-fg)]">
        {relativePath}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"

          onClick={handleCopy}

          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base font-semibold text-[var(--color-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-muted)]"
        >
          {copied ? copiedLabel : copyLabel}
        </button>

        <button
          type="button"

          onClick={handleNativeShare}

          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-3 py-2 text-base font-semibold text-[var(--color-primary-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-primary-hover)]"
        >
          {shareNativeLabel}
        </button>
      </div>
    </div>
  );
}
