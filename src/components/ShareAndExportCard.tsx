"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { BRAND, DOLBOL_LOGO_DATA_URI } from "@/config/brand";
import type { SupportedLocale } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";

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
        </div>

        {/* Live HTML Preview Card */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] via-[#0b6b47] to-[#043322] p-5 sm:p-7 text-white shadow-xl select-none"
        >
          {/* Subtle background glow decoration */}
          <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-emerald-400/25 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-emerald-300/20 blur-2xl pointer-events-none" />

          {/* Header */}
          <div className="relative z-10 flex items-start justify-between gap-3 border-b border-white/20 pb-3 sm:pb-3.5">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-1.5">
                <img
                  src={DOLBOL_LOGO_DATA_URI}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 rounded-md shrink-0 inline-block align-middle"
                  aria-hidden="true"
                />
                <span>{BRAND.name[locale === "bn" ? "bn" : "en"]}</span>
              </span>
              <span className="rounded-lg bg-white/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200 border border-white/10">
                {getSiteUrl().host}
              </span>
            </div>
            {dateRangeLabel ? (
              <span className="rounded-xl bg-white/20 px-3 py-1 text-xs font-bold text-white border border-white/20 backdrop-blur-xs flex items-center gap-1.5 shrink-0">
                <span>🗓️</span>
                <span>{dateRangeLabel}</span>
              </span>
            ) : null}
          </div>

          {/* Hero Trip Title & Destination */}
          <div className="relative z-10 my-4 space-y-2.5">
            <h4 className="text-2xl sm:text-3xl font-black leading-tight text-white tracking-tight">
              {tripName}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-100 border border-emerald-400/40 backdrop-blur-xs flex items-center gap-1.5">
                <span>📍</span>
                <span>{destination || (locale === "bn" ? "বাংলাদেশ" : "Bangladesh")}</span>
              </span>
              <span className="rounded-xl bg-white/15 px-3 py-1 text-xs font-bold text-white border border-white/20 backdrop-blur-xs flex items-center gap-1.5">
                <span>👥</span>
                <span>
                  {locale === "bn"
                    ? `${members.length} জন ভ্রমণসঙ্গী`
                    : `${members.length} Members`}
                </span>
              </span>
              <span className="rounded-xl bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-200 border border-amber-400/30 backdrop-blur-xs flex items-center gap-1.5">
                <span>🎒</span>
                <span>{locale === "bn" ? "গ্রুপ ট্রিপ" : "Group Trip"}</span>
              </span>
            </div>
          </div>

          {/* Middle Content: Itinerary highlights OR Branded Tagline Banner */}
          <div className="relative z-10 my-3.5">
            {itineraryHighlights.length > 0 ? (
              <div className="rounded-2xl bg-black/25 border border-white/15 p-3.5 sm:p-4 space-y-2 backdrop-blur-xs">
                <span className="text-[11px] font-bold text-emerald-200 block">
                  🗺️ {locale === "bn" ? "ভ্রমণ পরিকল্পনা:" : "Itinerary Highlights:"}
                </span>
                <ul className="space-y-1.5 text-xs text-white/95">
                  {itineraryHighlights.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="truncate flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/10 border border-white/20 p-3.5 sm:p-4 text-center backdrop-blur-xs space-y-1">
                <p className="text-sm sm:text-base font-extrabold text-white flex items-center justify-center gap-1.5">
                  <span>✨</span>
                  <span>{BRAND.tagline[locale === "bn" ? "bn" : "en"]}</span>
                </p>
                <p className="text-xs text-emerald-200/90 font-medium">
                  {locale === "bn"
                    ? "বন্ধুদের সাথে সুন্দর মুহূর্ত ও খরচের নির্ঝঞ্ঝাট সমাধান"
                    : "Effortless group travel planning & fair expense splitting"}
                </p>
              </div>
            )}
          </div>

          {/* Members Showcase */}
          {members.length > 0 ? (
            <div className="relative z-10 space-y-2 border-t border-white/20 pt-3">
              <span className="text-[11px] font-bold text-emerald-200 block">
                👥 {locale === "bn" ? `ভ্রমণসঙ্গী (${members.length} জন):` : `Members (${members.length}):`}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {members.slice(0, 10).map((m, idx) => (
                  <span
                    key={idx}
                    className="rounded-xl bg-black/30 border border-white/15 px-2.5 py-1 text-xs font-semibold text-white flex items-center gap-1.5 backdrop-blur-xs shadow-2xs"
                  >
                    <span>{m.emoji ?? "🎒"}</span>
                    <span>{m.displayName}</span>
                  </span>
                ))}
                {members.length > 10 ? (
                  <span className="rounded-xl bg-black/30 border border-white/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    +{members.length - 10} {locale === "bn" ? "জন" : "more"}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <div className="relative z-10 flex items-center justify-between border-t border-white/20 pt-2.5 mt-3 text-[11px] text-emerald-100/90">
            <span>
              {locale === "bn"
                ? `🇧🇩 ${BRAND.name.bn} • বন্ধুদের ট্যুর ও খরচের হিসাব`
                : `🇧🇩 ${BRAND.name.en} • Group trip & expense splitting`}
            </span>
            <span className="font-bold text-white">
              {getSiteUrl().host}
            </span>
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
