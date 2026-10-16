"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { SupportedLocale } from "@/lib/format";

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
  destination?: string | null;
  dateRangeLabel?: string | null;
  members?: Array<{ displayName: string; emoji: string | null; isGuest: boolean }>;
  itineraryHighlights?: string[];
  labels: ShareAndExportCardLabels;
  locale?: SupportedLocale;
}

export function ShareAndExportCard({
  slug,
  tripName,
  destination,
  dateRangeLabel,
  members = [],
  itineraryHighlights = [],
  labels,
  locale = "bn",
}: ShareAndExportCardProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
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

  async function handleDownloadPng(): Promise<void> {
    if (!cardRef.current) return;
    try {
      setDownloadingPng(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `trip-${slug}-summary.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export image via html-to-image:", err);
      // Fallback to server route if client export encounters canvas security issues
      const fallbackLink = document.createElement("a");
      fallbackLink.href = `/api/trips/${slug}/share-image?download=1`;
      fallbackLink.download = `trip-${slug}-summary.png`;
      fallbackLink.click();
    } finally {
      setDownloadingPng(false);
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
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-4 py-2 text-center text-xs font-bold text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all"
          >
            {labels.openPublicSummaryButton}
          </Link>

          <button
            type="button"
            onClick={handleCopySummaryLink}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
              copiedSummary
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 shadow-2xs"
            }`}
          >
            {copiedSummary
              ? `✓ ${labels.copiedPublicLink}`
              : labels.copyPublicLinkButton}
          </button>
        </div>
      </div>

      {/* 2. Shareable Summary Card (Rendered via browser with full Bangla font shaping + html-to-image PNG export) */}
      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
            <span>🖼️</span>
            <span>{labels.shareImageHeading}</span>
          </h3>
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            {locale === "bn" ? "✓ বাংলা ফন্ট সাপোর্ট" : "✓ Bangla Font Support"}
          </span>
        </div>

        {/* Live HTML Preview Card */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b6b47] via-[#085a3c] to-[#043322] p-5 sm:p-6 text-white shadow-md select-none"
        >
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-400/20 blur-xl" />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-emerald-300/15 blur-xl" />

          {/* Header */}
          <div className="relative z-10 flex items-start justify-between gap-3 border-b border-white/20 pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Trip Hub
              </span>
              <h4 className="text-lg sm:text-xl font-black leading-tight text-white tracking-tight">
                {tripName}
              </h4>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs shrink-0">
              📍 {destination || (locale === "bn" ? "বাংলাদেশ" : "Bangladesh")}
            </span>
          </div>

          {/* Body */}
          <div className="relative z-10 my-3.5 space-y-2.5">
            {dateRangeLabel ? (
              <p className="text-xs font-semibold text-emerald-100 flex items-center gap-1.5">
                <span>📅</span>
                <span>{dateRangeLabel}</span>
              </p>
            ) : null}

            {members.length > 0 ? (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-emerald-200 block">
                  👥 {locale === "bn" ? `ট্রিপের সদস্যরা (${members.length} জন):` : `Trip Members (${members.length}):`}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {members.slice(0, 10).map((m, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg bg-black/25 px-2 py-0.5 text-xs font-medium text-white border border-white/10"
                    >
                      {m.emoji ?? "🎒"} {m.displayName}
                    </span>
                  ))}
                  {members.length > 10 ? (
                    <span className="rounded-lg bg-black/25 px-2 py-0.5 text-xs font-medium text-emerald-200 border border-white/10">
                      +{members.length - 10} {locale === "bn" ? "জন" : "more"}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {itineraryHighlights.length > 0 ? (
              <div className="space-y-1 pt-1">
                <span className="text-[11px] font-bold text-emerald-200 block">
                  🗺️ {locale === "bn" ? "ভ্রমণ পরিকল্পনা:" : "Itinerary Highlights:"}
                </span>
                <ul className="space-y-1 text-xs text-white/90">
                  {itineraryHighlights.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="truncate flex items-center gap-1.5">
                      <span className="text-emerald-300">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="relative z-10 flex items-center justify-between border-t border-white/20 pt-2.5 text-[11px] text-emerald-100">
            <span>
              {locale === "bn"
                ? "🇧🇩 বন্ধুদের ট্যুর ও খরচের সহজ হিসাব"
                : "🇧🇩 Group trip & expense splitting"}
            </span>
            <span className="font-bold text-white">triphub.app</span>
          </div>
        </div>

        {/* Download Button */}
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={downloadingPng}
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-5 py-2.5 text-sm font-black text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
        >
          <span>📥</span>
          <span>
            {downloadingPng
              ? locale === "bn"
                ? "ছবি তৈরি হচ্ছে..."
                : "Generating image..."
              : labels.downloadShareImageButton}
          </span>
        </button>
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
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-4 py-2 text-center text-xs font-bold text-[#0f6b4a] shadow-2xs hover:bg-[#daf0e3] active:scale-95 transition-all"
          >
            <span>📥</span>
            <span>{labels.downloadCsvButton}</span>
          </a>

          <a
            href={`/api/trips/${slug}/cost-sheet?format=html`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-center text-xs font-bold text-gray-800 hover:bg-gray-50 active:scale-95 transition-all shadow-2xs"
          >
            <span>🖨️</span>
            <span>{labels.openPrintableSheetButton}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
