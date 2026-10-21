"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { BRAND, DOLBOL_LOGO_DATA_URI } from "@/config/brand";
import { type SupportedLocale, toBanglaDigits } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";

export interface PublicSummaryShareCardProps {
  slug: string;
  tripName: string;
  destination: string | null;
  topVotedDestination: string | null;
  dateRangeLabel: string | null;
  memberCount: number;
  members: Array<{
    displayName: string;
    emoji: string;
    isGuest: boolean;
  }>;
  itineraryDays: Array<{
    dayNumber: number;
    label: string;
    items: Array<{ id: string; title: string }>;
  }>;
  locale: SupportedLocale;
  labels: {
    heading: string;
    downloadButton: string;
  };
}

export function PublicSummaryShareCard({
  slug,
  tripName,
  destination,
  topVotedDestination,
  dateRangeLabel,
  memberCount,
  members,
  itineraryDays,
  locale,
  labels,
}: PublicSummaryShareCardProps) {
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const destText =
    destination ??
    topVotedDestination ??
    (locale === "bn" ? "বাংলাদেশ" : "Bangladesh");

  const itineraryHighlights = itineraryDays.flatMap((d) =>
    d.items.map(
      (item) =>
        `${locale === "bn" ? `দিন ${toBanglaDigits(d.dayNumber)}` : `Day ${d.dayNumber}`}: ${item.title}`,
    ),
  );

  async function handleDownloadPng(): Promise<void> {
    if (!cardRef.current) return;
    try {
      setDownloading(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `trip-summary-${slug}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export image via html-to-image:", err);
      // Fallback to server route if client canvas export fails
      const fallbackLink = document.createElement("a");
      fallbackLink.href = `/api/trips/${slug}/share-image?download=1`;
      fallbackLink.download = `trip-summary-${slug}.png`;
      fallbackLink.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>🖼️</span>
          <span>{labels.heading}</span>
        </h2>
      </div>

      {/* The Capturable Card with Full Native Bengali Typography */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] via-[#0b6b47] to-[#043322] p-5 sm:p-7 text-white shadow-xl select-none"
      >
        {/* Glow decorations */}
        <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-emerald-400/25 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-emerald-300/20 blur-2xl pointer-events-none" />

        {/* Top Header */}
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
              <span>{BRAND.name[locale]}</span>
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
          <h3 className="text-2xl sm:text-3xl font-black leading-tight text-white tracking-tight">
            {tripName}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-100 border border-emerald-400/40 backdrop-blur-xs flex items-center gap-1.5">
              <span>📍</span>
              <span>{destText}</span>
            </span>
            <span className="rounded-xl bg-white/15 px-3 py-1 text-xs font-bold text-white border border-white/20 backdrop-blur-xs flex items-center gap-1.5">
              <span>👥</span>
              <span>
                {locale === "bn"
                  ? `${toBanglaDigits(memberCount)} জন ভ্রমণসঙ্গী`
                  : `${memberCount} Members`}
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
                <span>{BRAND.tagline[locale]}</span>
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
              👥{" "}
              {locale === "bn"
                ? `ভ্রমণসঙ্গী (${toBanglaDigits(memberCount)} জন):`
                : `Members (${memberCount}):`}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {members.slice(0, 10).map((m, idx) => (
                <span
                  key={idx}
                  className="rounded-xl bg-black/30 border border-white/15 px-2.5 py-1 text-xs font-semibold text-white flex items-center gap-1.5 backdrop-blur-xs shadow-2xs"
                >
                  <span>{m.emoji}</span>
                  <span>{m.displayName}</span>
                </span>
              ))}
              {members.length > 10 ? (
                <span className="rounded-xl bg-black/30 border border-white/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  +{toBanglaDigits(members.length - 10)}{" "}
                  {locale === "bn" ? "জন" : "more"}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/20 pt-2.5 mt-3 text-[11px] text-emerald-100/90">
          <span>
            {locale === "bn"
              ? `🇧🇩 ${BRAND.name[locale]} • বন্ধুদের ট্যুর ও খরচের হিসাব`
              : `🇧🇩 ${BRAND.name[locale]} • Group trip & expense splitting`}
          </span>
          <span className="font-bold text-white">
            {locale === "bn" ? "পাবলিক সামারি" : "Public Summary"}
          </span>
        </div>
      </div>

      {/* Big Download Button */}
      <button
        type="button"
        onClick={handleDownloadPng}
        disabled={downloading}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
      >
        {downloading ? (
          <>
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>
              {locale === "bn" ? "ছবি তৈরি হচ্ছে..." : "Generating image..."}
            </span>
          </>
        ) : (
          <>
            <span>📥</span>
            <span>{labels.downloadButton}</span>
          </>
        )}
      </button>
    </div>
  );
}
