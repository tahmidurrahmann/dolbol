"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export interface ShareAndExportCardLabels {
  cardTitle: string;
  cardSubtitle: string;
  publicSummaryTitle: string;
  publicSummaryHint: string;
  openPublicSummaryButton: string;
  copyPublicLinkButton: string;
  copiedPublicLink: string;
  shareImageHeading: string;
  downloadShareImageButton: string;
  costSheetTitle: string;
  costSheetHint: string;
  downloadCsvButton: string;
  openPrintableSheetButton: string;
}

interface ShareAndExportCardProps {
  slug: string;
  tripName: string;
  labels: ShareAndExportCardLabels;
}

export function ShareAndExportCard({
  slug,
  tripName,
  labels,
}: ShareAndExportCardProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const summaryPath = `/trips/${slug}/summary`;

  async function handleCopySummaryLink(): Promise<void> {
    try {
      const fullUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${summaryPath}`
          : summaryPath;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>📤</span>
          <span>{labels.cardTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-fg-muted)]">
          {labels.cardSubtitle}
        </p>
      </div>

      {/* 1. Public Read-Only Summary Page (No Money Details) */}
      <div className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs">
        <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
          <span>🌐</span>
          <span>{labels.publicSummaryTitle}</span>
        </h3>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {labels.publicSummaryHint}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Link
            href={summaryPath}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-3 py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
          >
            {labels.openPublicSummaryButton}
          </Link>

          <button
            type="button"
            onClick={handleCopySummaryLink}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
              copiedSummary
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg)] hover:bg-[var(--color-border)]"
            }`}
          >
            {copiedSummary
              ? `✓ ${labels.copiedPublicLink}`
              : labels.copyPublicLinkButton}
          </button>
        </div>
      </div>

      {/* 2. Shareable Summary Image (PNG) */}
      <div className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs">
        <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
          <span>🖼️</span>
          <span>{labels.shareImageHeading}</span>
        </h3>
        <Image
          src={`/api/trips/${slug}/share-image`}
          alt={tripName}
          width={1200}
          height={630}
          unoptimized
          className="h-auto w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] shadow-2xs"
        />
        <a
          href={`/api/trips/${slug}/share-image?download=1`}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--color-primary)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]/40 active:scale-95 transition-all"
        >
          <span>📥</span>
          <span>{labels.downloadShareImageButton}</span>
        </a>
      </div>

      {/* 3. Downloadable Daily Cost Sheet (CSV + Printable / PDF) */}
      <div className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs">
        <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
          <span>📊</span>
          <span>{labels.costSheetTitle}</span>
        </h3>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {labels.costSheetHint}
        </p>
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <a
            href={`/api/trips/${slug}/cost-sheet?format=csv`}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all"
          >
            <span>📥</span>
            <span>{labels.downloadCsvButton}</span>
          </a>

          <a
            href={`/api/trips/${slug}/cost-sheet?format=html`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-center text-xs font-bold text-[var(--color-fg)] hover:bg-[var(--color-border)] active:scale-95 transition-all"
          >
            <span>🖨️</span>
            <span>{labels.openPrintableSheetButton}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
