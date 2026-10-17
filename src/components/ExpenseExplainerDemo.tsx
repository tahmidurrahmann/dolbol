"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatTaka } from "@/lib/format";

export interface ExpenseExplainerDemoProps {
  locale?: "bn" | "en";
  mode?: "trip" | "landing";
  timeFreeze?: number;
  className?: string;
  onTrySelf?: () => void;
  labels?: {
    badge?: string;
    ariaLabel?: string;
    tryYourself?: string;
    pause?: string;
    play?: string;
    cardTitle?: string;
    cardSubtitle?: string;
    inputHelper?: string;
    clearBtn?: string;
    exampleLabel?: string;
    examplePrompt?: string;
    aiChip?: string;
    aiReading?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    draftBanner?: string;
    draftBadge?: string;
    reviewDraftBadge?: string;
    categoryFood?: string;
    categoryBreakfast?: string;
    item1Title?: string;
    item2Title?: string;
    item3Title?: string;
    itemPayer?: string;
    member1?: string;
    member2?: string;
    member3?: string;
    member4?: string;
    footerSummary?: string;
    addAllButton?: string;
    reviewCaption?: string;
    addedSuccess?: string;
    settlementHeader?: string;
    perPersonShare?: string;
    debtTransfer?: string;
  };
}

export function ExpenseExplainerDemo({
  locale = "bn",
  mode = "trip",
  timeFreeze,
  className = "",
  onTrySelf,
  labels: customLabels,
}: ExpenseExplainerDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isOffScreen, setIsOffScreen] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);

  // Localized strings matching real AiExpenseParserCard UI
  const labels = {
    badge: customLabels?.badge ?? (locale === "bn" ? "উদাহরণ" : "Example"),
    ariaLabel:
      customLabels?.ariaLabel ??
      (locale === "bn"
        ? "১০ সেকেন্ডের অ্যানিমেশন: মেসেজ লিখে এআই দিয়ে কীভাবে মুহূর্তেই খরচ যোগ ও ভাগ করা যায় তা দেখানো হচ্ছে"
        : "10-second animation showing how to add and split expenses using AI"),
    tryYourself:
      customLabels?.tryYourself ??
      (locale === "bn" ? "নিজে চেষ্টা করুন" : "Try it yourself"),
    pause:
      customLabels?.pause ??
      (locale === "bn" ? "অ্যানিমেশন থামান" : "Pause animation"),
    play:
      customLabels?.play ??
      (locale === "bn" ? "অ্যানিমেশন চালান" : "Play animation"),
    cardTitle:
      customLabels?.cardTitle ??
      (locale === "bn"
        ? "এআই দিয়ে এক ক্লিকে খরচ যোগ"
        : "Add Expenses with AI"),
    cardSubtitle:
      customLabels?.cardSubtitle ??
      (locale === "bn"
        ? "মেসেজের মতো বাংলায় বা বাংলিশে লিখুন—এআই নিজে থেকেই হিসাব সাজিয়ে দেবে"
        : "Type naturally in Bangla or Banglish—AI will draft the expenses for you"),
    inputHelper:
      customLabels?.inputHelper ??
      (locale === "bn"
        ? "💡 মেসেজের মতো স্বাভাবিক বাংলায় বা বাংলিশে লিখুন—নিচে যাচাই ও এডিট করতে পারবেন"
        : "💡 Type naturally in Bangla or Banglish—you can review and edit details below"),
    clearBtn:
      customLabels?.clearBtn ?? (locale === "bn" ? "মুছুন" : "Clear"),
    exampleLabel:
      customLabels?.exampleLabel ??
      (locale === "bn" ? "বাস্তব উদাহরণ:" : "Realistic example:"),
    examplePrompt:
      customLabels?.examplePrompt ??
      (locale === "bn"
        ? "সকালের নাস্তা ২৫০, দুপুরের খাবার ৮০০, রাতের ডিনার ১২০০"
        : "Shokaler nasta 250, dupurer khabar 800, rater dinner 1200"),
    aiChip: customLabels?.aiChip ?? (locale === "bn" ? "এআই" : "AI"),
    aiReading:
      customLabels?.aiReading ??
      (locale === "bn" ? "এআই পড়ছে…" : "AI is reading…"),
    line1:
      customLabels?.line1 ??
      (locale === "bn" ? "rater khabar 1200" : "dinner 1200"),
    line2:
      customLabels?.line2 ??
      (locale === "bn" ? "shokaler nasta 200" : "breakfast 200"),
    line3:
      customLabels?.line3 ??
      (locale === "bn" ? "DUPURER khabar 600" : "lunch 600"),
    draftBanner:
      customLabels?.draftBanner ??
      (locale === "bn"
        ? "নিচের ৩টি খরচ তৈরি হয়েছে, দেখে নিন"
        : "Review the 3 drafted expenses below"),
    draftBadge:
      customLabels?.draftBadge ?? (locale === "bn" ? "নতুন তৈরি" : "New Draft"),
    reviewDraftBadge:
      customLabels?.reviewDraftBadge ??
      (locale === "bn"
        ? "যাচাই করুন (এখনো সেভ হয়নি)"
        : "Review draft (not saved yet)"),
    categoryFood:
      customLabels?.categoryFood ?? (locale === "bn" ? "🍛 খাবার" : "🍛 Food"),
    categoryBreakfast:
      customLabels?.categoryBreakfast ??
      (locale === "bn" ? "☕ নাস্তা" : "☕ Breakfast"),
    item1Title:
      customLabels?.item1Title ?? (locale === "bn" ? "রাতের খাবার" : "Dinner"),
    item2Title:
      customLabels?.item2Title ??
      (locale === "bn" ? "সকালের নাস্তা" : "Breakfast"),
    item3Title:
      customLabels?.item3Title ?? (locale === "bn" ? "দুপুরের খাবার" : "Lunch"),
    itemPayer:
      customLabels?.itemPayer ?? (locale === "bn" ? "করিম" : "Karim"),
    member1: customLabels?.member1 ?? (locale === "bn" ? "করিম" : "Karim"),
    member2: customLabels?.member2 ?? (locale === "bn" ? "সুমি" : "Sumi"),
    member3: customLabels?.member3 ?? (locale === "bn" ? "তানভীর" : "Tanvir"),
    member4: customLabels?.member4 ?? (locale === "bn" ? "নাবিলা" : "Nabila"),
    footerSummary:
      customLabels?.footerSummary ??
      (locale === "bn" ? "৩টি খরচ · মোট {total}" : "3 expenses · Total {total}"),
    addAllButton:
      customLabels?.addAllButton ??
      (locale === "bn" ? "সবগুলো যোগ করুন (৩)" : "Add all (3)"),
    reviewCaption:
      customLabels?.reviewCaption ??
      (locale === "bn"
        ? "দেখে নিন, ভুল হলে ঠিক করুন"
        : "Review and edit before saving"),
    addedSuccess:
      customLabels?.addedSuccess ??
      (locale === "bn"
        ? "৩টি খরচ সফলভাবে যোগ করা হয়েছে।"
        : "3 expenses saved successfully."),
    settlementHeader:
      customLabels?.settlementHeader ??
      (locale === "bn"
        ? "হিসাব নিষ্পত্তি (Settlement)"
        : "Settlement Share"),
    perPersonShare:
      customLabels?.perPersonShare ??
      (locale === "bn" ? "৪ জনের জনপ্রতি ৫০০৳" : "৳500 each (4 members)"),
    debtTransfer:
      customLabels?.debtTransfer ??
      (locale === "bn" ? "সুমি → করিম {amount}" : "Sumi → Karim {amount}"),
  };

  // IntersectionObserver to pause when off-screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsOffScreen(!entry.isIntersecting);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Document visibility change listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabHidden(document.visibilityState === "hidden");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const isFrozen = typeof timeFreeze === "number";
  const isPlaying = !isFrozen && !isManualPaused && !isOffScreen && !isTabHidden;

  // Single shared duration variable
  const sharedDuration = "var(--demo-duration, 10s)";

  // CSS style helper for synchronized keyframe animation
  const animStyle = (keyframeName: string): React.CSSProperties => {
    if (isFrozen) {
      return {
        animationName: keyframeName,
        animationDuration: sharedDuration,
        animationIterationCount: "infinite",
        animationFillMode: "both",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        animationPlayState: "paused",
        animationDelay: `-${timeFreeze}s`,
      };
    }
    return {
      animationName: keyframeName,
      animationDuration: sharedDuration,
      animationIterationCount: "infinite",
      animationFillMode: "both",
      animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      animationPlayState: isPlaying ? "running" : "paused",
    };
  };

  const handleTrySelf = () => {
    if (onTrySelf) {
      onTrySelf();
      return;
    }
    const input = document.getElementById(
      "ai-expense-input",
    ) as HTMLTextAreaElement | null;
    if (input) {
      const demoText =
        locale === "bn"
          ? "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600"
          : "dinner 1200\nbreakfast 200\nlunch 600";

      // Dispatch native input event to ensure React state updates
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(input, demoText);
      } else {
        input.value = demoText;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const formattedShare = formatTaka(500, locale);

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[480px] mx-auto select-none overflow-hidden rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[#e8f5ef] via-[#f4faf6] to-white p-3 sm:p-4 shadow-xs transition-shadow hover:shadow-md ${className}`}
      role="img"
      aria-label={labels.ariaLabel}
    >
      {/* Decorative sparkle accents */}
      <span
        aria-hidden="true"
        className="demo-anim demo-reduced-hide pointer-events-none absolute right-4 top-3 text-sm select-none text-emerald-500/70"
        style={animStyle("demo-sparkle")}
      >
        ✨
      </span>
      <span
        aria-hidden="true"
        className="demo-anim demo-reduced-hide pointer-events-none absolute left-4 bottom-3 text-xs select-none text-emerald-400/60"
        style={animStyle("demo-sparkle")}
      >
        ✨
      </span>

      {/* Top Header: Badge, Subtitle & Accessible Pause/Play Button */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]/60">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🎬</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-900 border border-emerald-300 shadow-2xs">
            {labels.badge}
          </span>
          <span className="text-xs font-bold text-gray-700 hidden sm:inline">
            {locale === "bn" ? "কীভাবে কাজ করে দেখুন" : "Watch how it works"}
          </span>
        </div>

        {/* 44x44px accessible pause/play toggle */}
        <button
          type="button"
          onClick={() => setIsManualPaused((prev) => !prev)}
          aria-label={isPlaying ? labels.pause : labels.play}
          className="demo-pause-btn flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-500 hover:text-emerald-800 hover:bg-emerald-100/60 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-sm font-bold">{isPlaying ? "⏸" : "▶"}</span>
        </button>
      </div>

      {/* Main Scene: Aspect Ratio 4/3 */}
      <div className="relative mt-2 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-surface)] shadow-inner">
        {/* =========================================================
            ANIMATED VERSION (active when reduced-motion is FALSE)
            ========================================================= */}
        <div
          aria-hidden="true"
          className="demo-anim demo-reduced-hide relative h-full w-full"
          style={animStyle("demo-scene-fade")}
        >
          {/* -------------------------------------------------------------
              PHASE 1 (0.0s - 4.0s):
              Input Card matching real AiExpenseParserCard UI identically
              ------------------------------------------------------------- */}
          <div
            className="demo-anim absolute inset-0 flex flex-col justify-between rounded-2xl border border-[var(--color-border)] bg-white p-2.5 sm:p-3 shadow-xs"
            style={animStyle("demo-input-phase")}
          >
            {/* Real Card Header with Title, Subtitle, and AI Chip */}
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-1.5">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5 truncate">
                  <span className="text-emerald-600">✨</span>
                  <span>{labels.cardTitle}</span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-neutral-400 line-clamp-1">
                  {labels.cardSubtitle}
                </p>
              </div>

              {/* Top-Right AI Chip: Idle ✨ vs Reading pulsing dots */}
              <div className="relative flex items-center justify-end shrink-0 pt-0.5">
                {/* Idle Chip (0.0s - 3.2s) */}
                <span
                  className="demo-anim inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800 border border-emerald-300 shadow-2xs"
                  style={animStyle("demo-chip-idle")}
                >
                  <span>✨</span>
                  <span>{labels.aiChip}</span>
                </span>

                {/* Reading Chip (3.2s - 4.0s) */}
                <span
                  className="demo-anim absolute right-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow-2xs"
                  style={animStyle("demo-chip-active")}
                >
                  <span>{labels.aiReading}</span>
                  <span className="flex gap-0.5 ml-0.5">
                    <span
                      className="demo-anim h-1 w-1 rounded-full bg-white"
                      style={animStyle("demo-pulse-dot")}
                    />
                    <span
                      className="demo-anim h-1 w-1 rounded-full bg-white [animation-delay:0.2s]"
                      style={animStyle("demo-pulse-dot")}
                    />
                    <span
                      className="demo-anim h-1 w-1 rounded-full bg-white [animation-delay:0.4s]"
                      style={animStyle("demo-pulse-dot")}
                    />
                  </span>
                </span>
              </div>
            </div>

            {/* Real Textarea Card Container with typed lines and bottom helper bar */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-2 sm:p-2.5 shadow-2xs space-y-1.5">
              {/* 3 typed lines (revealed line-by-line via clip-path) */}
              <div className="space-y-0.5 font-mono text-[11px] sm:text-xs font-semibold text-emerald-950 min-h-[58px] py-0.5">
                <div
                  className="demo-anim whitespace-nowrap overflow-hidden"
                  style={animStyle("demo-type-line-1")}
                >
                  {labels.line1}
                </div>
                <div
                  className="demo-anim whitespace-nowrap overflow-hidden"
                  style={animStyle("demo-type-line-2")}
                >
                  {labels.line2}
                </div>
                <div
                  className="demo-anim whitespace-nowrap overflow-hidden font-bold"
                  style={animStyle("demo-type-line-3")}
                >
                  {labels.line3}
                </div>
              </div>

              {/* Bottom helper bar inside input container */}
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100 text-[10px] text-neutral-500">
                <span className="truncate">{labels.inputHelper}</span>
                <span className="text-neutral-400 shrink-0 font-medium">
                  ✕ {labels.clearBtn}
                </span>
              </div>
            </div>

            {/* Real Example Chip matching AiExpenseParserCard sample pills */}
            <div className="space-y-1">
              <span className="block text-[10px] font-bold text-neutral-600">
                {labels.exampleLabel}
              </span>
              <div className="rounded-full border border-gray-200/90 bg-[#f4f7f5] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-gray-700 truncate shadow-2xs">
                &ldquo;{labels.examplePrompt}&rdquo;
              </div>
            </div>

            {/* Primary Submit Button matching Button variant="primary" soft mint style */}
            <div className="relative pt-0.5">
              <div
                className="demo-anim relative overflow-hidden rounded-full min-h-[36px] sm:min-h-[40px] w-full font-bold text-xs sm:text-sm flex items-center justify-center shadow-2xs transition-all bg-[#e8f5ee] border border-emerald-300/80 text-[#0f6b4a]"
                style={animStyle("demo-btn-tap")}
              >
                {/* Idle Button State: + যুক্ত করুন (0.0s - 3.2s) */}
                <span
                  className="demo-anim inline-flex items-center gap-1.5"
                  style={animStyle("demo-btn-label-idle")}
                >
                  <span>+</span>
                  <span>{locale === "bn" ? "যুক্ত করুন" : "Add Expenses"}</span>
                </span>

                {/* Loading Button State: এআই পড়ছে... (3.2s - 4.0s) */}
                <span
                  className="demo-anim absolute inline-flex items-center gap-1.5 font-bold text-emerald-800"
                  style={animStyle("demo-btn-label-reading")}
                >
                  <span>{labels.aiReading}</span>
                  <span className="flex gap-0.5 ml-0.5">
                    <span
                      className="demo-anim h-1.5 w-1.5 rounded-full bg-emerald-700"
                      style={animStyle("demo-pulse-dot")}
                    />
                    <span
                      className="demo-anim h-1.5 w-1.5 rounded-full bg-emerald-700 [animation-delay:0.2s]"
                      style={animStyle("demo-pulse-dot")}
                    />
                    <span
                      className="demo-anim h-1.5 w-1.5 rounded-full bg-emerald-700 [animation-delay:0.4s]"
                      style={animStyle("demo-pulse-dot")}
                    />
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              PHASE 2 (4.0s - 7.4s):
              Real Generated Draft Review Form Card identically matching AiExpenseParserCard
              ------------------------------------------------------------- */}
          <div
            className="demo-anim absolute inset-0 flex flex-col justify-between rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-2 sm:p-2.5 shadow-xs"
            style={animStyle("demo-confirm-phase")}
          >
            {/* Top Draft Indicator Banner matching real feedback banner */}
            <div className="flex items-center justify-between gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-950 shadow-2xs">
              <span className="flex items-center gap-1 truncate">
                <span>👇</span>
                <span className="truncate">{labels.draftBanner}</span>
              </span>
              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                {labels.draftBadge}
              </span>
            </div>

            {/* Active item tabs indicating item 1, 2, 3 */}
            <div className="flex items-center gap-1 pt-0.5">
              <span
                className="demo-anim flex-1 text-center py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold transition-all shadow-2xs"
                style={animStyle("demo-tab-1")}
              >
                1. {labels.item1Title} (৳1,200)
              </span>
              <span
                className="demo-anim flex-1 text-center py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold transition-all shadow-2xs"
                style={animStyle("demo-tab-2")}
              >
                2. {labels.item2Title} (৳200)
              </span>
              <span
                className="demo-anim flex-1 text-center py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold transition-all shadow-2xs"
                style={animStyle("demo-tab-3")}
              >
                3. {labels.item3Title} (৳600)
              </span>
            </div>

            {/* The Real Form Cards (Card 1, Card 2, Card 3) matching user's exact specifications */}
            <div className="relative my-auto min-h-[144px]">
              {/* Card 1: রাতের খাবার ৳1,200 */}
              <div
                className="demo-anim absolute inset-0 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-2xs"
                style={animStyle("demo-draft-card-1")}
              >
                {/* Header: 1 | Category Badge | Remove */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-extrabold text-neutral-800">
                      1
                    </span>
                    <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900 border border-emerald-200">
                      {labels.categoryFood}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-400">
                    ✕ {locale === "bn" ? "মুছুন" : "Remove"}
                  </span>
                </div>

                {/* What was it for? & Amount (৳) Grid */}
                <div className="grid grid-cols-12 gap-1.5 items-start">
                  <div className="col-span-7 sm:col-span-8 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কিসের খরচ?" : "What was it for?"}
                    </span>
                    <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--color-fg)] flex items-center shadow-2xs truncate">
                      {labels.item1Title}
                    </div>
                  </div>

                  <div className="col-span-5 sm:col-span-4 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "টাকা (৳)" : "Amount (৳)"}
                    </span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-[11px] font-bold text-[var(--color-primary)]">
                        ৳
                      </span>
                      <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white pl-5 pr-1.5 py-0.5 text-[11px] sm:text-xs font-bold text-[var(--color-primary)] flex items-center shadow-2xs">
                        1,200
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category, Who paid? & Date Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "ক্যাটাগরি" : "Category"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">{labels.categoryFood}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "কে দিলেন?*" : "Who paid?*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">🐅 {labels.member1}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "তারিখ*" : "Date*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">
                        {locale === "bn" ? "১৭ অক্টো, ২০২৬" : "Oct 17, 2026"}
                      </span>
                      <span className="text-[8px] text-neutral-400">📅</span>
                    </div>
                  </div>
                </div>

                {/* Who shared this? */}
                <div className="space-y-0.5 rounded-lg border border-[var(--color-border)] bg-gray-50/70 p-1.5 text-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কারা ভাগ করবে?" : "Who shared this?"}
                    </span>
                    <span className="font-bold text-[var(--color-primary)]">
                      {locale === "bn" ? "সবাই" : "Everyone"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🐅</span> <span>{labels.member1}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🌴</span> <span>{labels.member2}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🚤</span> <span>{labels.member3}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🎒</span> <span>{labels.member4}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: সকালের নাস্তা ৳200 */}
              <div
                className="demo-anim absolute inset-0 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-2xs"
                style={animStyle("demo-draft-card-2")}
              >
                {/* Header: 2 | Category Badge | Remove */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-extrabold text-neutral-800">
                      2
                    </span>
                    <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900 border border-emerald-200">
                      {labels.categoryBreakfast}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-400">
                    ✕ {locale === "bn" ? "মুছুন" : "Remove"}
                  </span>
                </div>

                {/* What was it for? & Amount (৳) Grid */}
                <div className="grid grid-cols-12 gap-1.5 items-start">
                  <div className="col-span-7 sm:col-span-8 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কিসের খরচ?" : "What was it for?"}
                    </span>
                    <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--color-fg)] flex items-center shadow-2xs truncate">
                      {labels.item2Title}
                    </div>
                  </div>

                  <div className="col-span-5 sm:col-span-4 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "টাকা (৳)" : "Amount (৳)"}
                    </span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-[11px] font-bold text-[var(--color-primary)]">
                        ৳
                      </span>
                      <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white pl-5 pr-1.5 py-0.5 text-[11px] sm:text-xs font-bold text-[var(--color-primary)] flex items-center shadow-2xs">
                        200
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category, Who paid? & Date Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "ক্যাটাগরি" : "Category"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">{labels.categoryBreakfast}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "কে দিলেন?*" : "Who paid?*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">🐅 {labels.member1}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "তারিখ*" : "Date*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">
                        {locale === "bn" ? "১৭ অক্টো, ২০২৬" : "Oct 17, 2026"}
                      </span>
                      <span className="text-[8px] text-neutral-400">📅</span>
                    </div>
                  </div>
                </div>

                {/* Who shared this? */}
                <div className="space-y-0.5 rounded-lg border border-[var(--color-border)] bg-gray-50/70 p-1.5 text-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কারা ভাগ করবে?" : "Who shared this?"}
                    </span>
                    <span className="font-bold text-[var(--color-primary)]">
                      {locale === "bn" ? "সবাই" : "Everyone"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🐅</span> <span>{labels.member1}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🌴</span> <span>{labels.member2}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🚤</span> <span>{labels.member3}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🎒</span> <span>{labels.member4}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: দুপুরের খাবার ৳600 */}
              <div
                className="demo-anim absolute inset-0 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-2xs"
                style={animStyle("demo-draft-card-3")}
              >
                {/* Header: 3 | Category Badge | Remove */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-extrabold text-neutral-800">
                      3
                    </span>
                    <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900 border border-emerald-200">
                      {labels.categoryFood}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-neutral-400">
                    ✕ {locale === "bn" ? "মুছুন" : "Remove"}
                  </span>
                </div>

                {/* What was it for? & Amount (৳) Grid */}
                <div className="grid grid-cols-12 gap-1.5 items-start">
                  <div className="col-span-7 sm:col-span-8 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কিসের খরচ?" : "What was it for?"}
                    </span>
                    <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--color-fg)] flex items-center shadow-2xs truncate">
                      {labels.item3Title}
                    </div>
                  </div>

                  <div className="col-span-5 sm:col-span-4 space-y-0.5">
                    <span className="block text-[9px] sm:text-[10px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "টাকা (৳)" : "Amount (৳)"}
                    </span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-[11px] font-bold text-[var(--color-primary)]">
                        ৳
                      </span>
                      <div className="min-h-[26px] w-full rounded-lg border border-[var(--color-border)] bg-white pl-5 pr-1.5 py-0.5 text-[11px] sm:text-xs font-bold text-[var(--color-primary)] flex items-center shadow-2xs">
                        600
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category, Who paid? & Date Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "ক্যাটাগরি" : "Category"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">{labels.categoryFood}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "কে দিলেন?*" : "Who paid?*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">🐅 {labels.member1}</span>
                      <span className="text-[8px] text-neutral-400">▾</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="block text-[9px] font-bold text-neutral-500 truncate">
                      {locale === "bn" ? "তারিখ*" : "Date*"}
                    </span>
                    <div className="min-h-[24px] rounded-md border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-800 flex items-center justify-between shadow-2xs truncate">
                      <span className="truncate">
                        {locale === "bn" ? "১৭ অক্টো, ২০২৬" : "Oct 17, 2026"}
                      </span>
                      <span className="text-[8px] text-neutral-400">📅</span>
                    </div>
                  </div>
                </div>

                {/* Who shared this? */}
                <div className="space-y-0.5 rounded-lg border border-[var(--color-border)] bg-gray-50/70 p-1.5 text-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কারা ভাগ করবে?" : "Who shared this?"}
                    </span>
                    <span className="font-bold text-[var(--color-primary)]">
                      {locale === "bn" ? "সবাই" : "Everyone"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🐅</span> <span>{labels.member1}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🌴</span> <span>{labels.member2}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🚤</span> <span>{labels.member3}</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🎒</span> <span>{labels.member4}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* + Add another expense & Real Footer bar matching AiExpenseParserCard */}
            <div className="space-y-1 pt-0.5 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)]">
                <span>+</span>
                <span>
                  {locale === "bn"
                    ? "আরেকটি খরচ যোগ করুন"
                    : "Add another expense"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                  {locale === "bn"
                    ? "৩টি খরচ, মোট ৳২,০০০"
                    : "3 expenses, total ৳2,000"}
                </div>

                <div
                  className="demo-anim rounded-full bg-[#0f6b4a] text-white font-bold px-3 py-1 text-[10px] sm:text-[11px] shadow-2xs shrink-0 cursor-pointer"
                  style={animStyle("demo-add-all-tap")}
                >
                  ✓ {labels.addAllButton}
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              PHASE 3 (7.4s - 8.8s):
              Real Direct Success Notification & Settlement Result
              ------------------------------------------------------------- */}
          <div
            className="demo-anim absolute inset-0 flex flex-col justify-between rounded-2xl border-2 border-emerald-400 bg-emerald-50/95 p-3 sm:p-3.5 shadow-md"
            style={animStyle("demo-success-phase")}
          >
            {/* Real Success Notification Banner */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-emerald-900 shadow-2xs">
              <div className="flex items-center gap-2 truncate">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-extrabold text-white shrink-0">
                  ✓
                </span>
                <span className="truncate">{labels.addedSuccess}</span>
              </div>
              <span className="text-neutral-400 text-xs shrink-0">✕</span>
            </div>

            {/* Real Settlement Result Card (সুমি → করিম ৳৫০০) */}
            <div className="my-auto rounded-2xl border border-emerald-200 bg-white p-2.5 sm:p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  {labels.settlementHeader}
                </span>
                <span className="text-[10px] font-extrabold text-emerald-700">
                  {labels.perPersonShare}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-emerald-50/80 rounded-xl p-2 border border-emerald-200">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-900">
                  <span className="text-sm">👤</span>
                  <span>
                    {labels.debtTransfer.replace("{amount}", formattedShare)}
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-black text-emerald-800">
                  {formattedShare}
                </span>
              </div>
            </div>

            {/* Try It Yourself Primary Action Button */}
            {mode === "landing" ? (
              <Link
                href="/trips/new"
                className="inline-flex min-h-[40px] sm:min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0f6b4a] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
              >
                🚀 {labels.tryYourself}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleTrySelf}
                className="inline-flex min-h-[40px] sm:min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0f6b4a] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
              >
                ✍️ {labels.tryYourself}
              </button>
            )}
          </div>
        </div>

        {/* =========================================================
            REDUCED MOTION STATIC FRAME (prefers-reduced-motion: reduce)
            Displays the 7.4s - 8.8s complete settlement result state statically
            ========================================================= */}
        <div
          aria-hidden="true"
          className="demo-reduced-show hidden flex-col justify-between h-full w-full rounded-2xl border-2 border-emerald-400 bg-emerald-50/95 p-3 sm:p-3.5 shadow-md"
        >
          {/* Top Success Banner */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                ✓
              </span>
              <span>{labels.addedSuccess}</span>
            </div>
            <span className="text-neutral-400 text-xs">✕</span>
          </div>

          {/* Three Summary Expense Lines */}
          <div className="space-y-1 my-auto">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-800 bg-white p-1.5 rounded-lg border border-emerald-100">
              <span className="flex items-center gap-1.5">
                <span>🍛</span>
                <span>{labels.item1Title}</span>
                <span className="text-[10px] text-neutral-500">
                  (🐅 {labels.member1})
                </span>
              </span>
              <span className="font-bold text-emerald-800">৳1,200</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-800 bg-white p-1.5 rounded-lg border border-emerald-100">
              <span className="flex items-center gap-1.5">
                <span>☕</span>
                <span>{labels.item2Title}</span>
                <span className="text-[10px] text-neutral-500">
                  (🐅 {labels.member1})
                </span>
              </span>
              <span className="font-bold text-emerald-800">৳200</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-800 bg-white p-1.5 rounded-lg border border-emerald-100">
              <span className="flex items-center gap-1.5">
                <span>🍲</span>
                <span>{labels.item3Title}</span>
                <span className="text-[10px] text-neutral-500">
                  (🐅 {labels.member1})
                </span>
              </span>
              <span className="font-bold text-emerald-800">৳600</span>
            </div>
          </div>

          {/* Result Chip: Who owes whom (সুমি → করিম ৳৫০০) */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-2.5 sm:p-3 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {labels.settlementHeader}
              </span>
              <span className="text-[10px] font-extrabold text-emerald-700">
                {labels.perPersonShare}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 bg-emerald-50/80 rounded-xl p-2 border border-emerald-200">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-900">
                <span>👤</span>
                <span>
                  {labels.debtTransfer.replace("{amount}", formattedShare)}
                </span>
              </div>
              <span className="text-xs font-black text-emerald-800">
                {formattedShare}
              </span>
            </div>
          </div>

          {/* Action Button */}
          {mode === "landing" ? (
            <Link
              href="/trips/new"
              className="mt-1 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#0f6b4a] py-1.5 text-center text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
            >
              🚀 {labels.tryYourself}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleTrySelf}
              className="mt-1 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#0f6b4a] py-1.5 text-center text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
            >
              ✍️ {labels.tryYourself}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
