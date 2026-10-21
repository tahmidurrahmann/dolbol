"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatTaka } from "@/lib/format";
import { scrollToAddExpense } from "@/lib/scroll-to-add-expense";

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
    dailyExpensesTitle?: string;
    day1Label?: string;
    dayTotalLabel?: string;
    perPersonCostLabel?: string;
    paidByPrefix?: string;
    editBtn?: string;
    deleteBtn?: string;
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

  // Localized strings matching real AiExpenseParserCard & PerDayExpensesView UI
  const labels = {
    badge: customLabels?.badge ?? (locale === "bn" ? "উদাহরণ" : "Example"),
    ariaLabel:
      customLabels?.ariaLabel ??
      (locale === "bn"
        ? "১৫ সেকেন্ডের অ্যানিমেশন: মেসেজ লিখে এআই দিয়ে কীভাবে মুহূর্তেই খরচ যোগ ও ভাগ করা যায় তা দেখানো হচ্ছে"
        : "15-second animation showing how to add and split expenses using AI"),
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
      (locale === "bn" ? "এআই দিয়ে এক ক্লিকে খরচ যোগ" : "Add Expenses with AI"),
    cardSubtitle:
      customLabels?.cardSubtitle ??
      (locale === "bn"
        ? "মেসেজের মতো বাংলায় বা বাংলিশে লিখুন, এআই নিজে থেকেই হিসাব সাজিয়ে দেবে"
        : "Type naturally in Bangla or Banglish, AI will draft the expenses for you"),
    inputHelper:
      customLabels?.inputHelper ??
      (locale === "bn"
        ? "💡 মেসেজের মতো স্বাভাবিক বাংলায় বা বাংলিশে লিখুন, নিচে যাচাই ও এডিট করতে পারবেন"
        : "💡 Type naturally in Bangla or Banglish, you can review and edit details below"),
    clearBtn: customLabels?.clearBtn ?? (locale === "bn" ? "মুছুন" : "Clear"),
    exampleLabel:
      customLabels?.exampleLabel ??
      (locale === "bn" ? "বাস্তব উদাহরণ:" : "Realistic example:"),
    examplePrompt:
      customLabels?.examplePrompt ??
      (locale === "bn"
        ? "রাতের ডিনার ১২০০ (Tahmidur দিল)"
        : "Rater dinner 1200 paid by Tahmidur"),
    aiChip: customLabels?.aiChip ?? (locale === "bn" ? "এআই" : "AI"),
    aiReading:
      customLabels?.aiReading ??
      (locale === "bn" ? "এআই পড়ছে…" : "AI is reading…"),
    line1:
      customLabels?.line1 ??
      (locale === "bn"
        ? "রাতের ডিনার ১২০০ (Tahmidur দিল)"
        : "Rater dinner 1200 paid by Tahmidur"),
    line2: customLabels?.line2 ?? "",
    line3: customLabels?.line3 ?? "",
    draftBanner:
      customLabels?.draftBanner ??
      (locale === "bn"
        ? "নিচের খরচটি তৈরি হয়েছে, দেখে নিন"
        : "Review the drafted expense below"),
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
      customLabels?.item1Title ?? (locale === "bn" ? "রাতের ডিনার" : "Dinner"),
    item2Title:
      customLabels?.item2Title ??
      (locale === "bn" ? "সকালের নাস্তা" : "Breakfast"),
    item3Title:
      customLabels?.item3Title ?? (locale === "bn" ? "দুপুরের খাবার" : "Lunch"),
    itemPayer:
      customLabels?.itemPayer ??
      (locale === "bn" ? "কে দিলেন: 🏔️ Tahmidur" : "Paid by: 🏔️ Tahmidur"),
    member1: customLabels?.member1 ?? "Tahmidur",
    member2: customLabels?.member2 ?? "Rahman",
    member3: customLabels?.member3 ?? (locale === "bn" ? "তানভীর" : "Tanvir"),
    member4: customLabels?.member4 ?? (locale === "bn" ? "নাবিলা" : "Nabila"),
    footerSummary:
      customLabels?.footerSummary ??
      (locale === "bn" ? "১টি খরচ, মোট ৳১,২০০" : "1 expense, total ৳1,200"),
    addAllButton:
      customLabels?.addAllButton ??
      (locale === "bn" ? "সবগুলো যোগ করুন" : "Add all"),
    reviewCaption:
      customLabels?.reviewCaption ??
      (locale === "bn"
        ? "দেখে নিন, ভুল হলে ঠিক করুন"
        : "Review and edit before saving"),
    addedSuccess:
      customLabels?.addedSuccess ??
      (locale === "bn"
        ? "১টি খরচ সফলভাবে যোগ করা হয়েছে।"
        : "1 expense saved successfully."),
    dailyExpensesTitle:
      customLabels?.dailyExpensesTitle ??
      (locale === "bn" ? "দৈনিক খরচ" : "Daily expenses"),
    day1Label:
      customLabels?.day1Label ??
      (locale === "bn" ? "১ম দিন · ৬ অক্টো, ২০২৬" : "Day 1 · Oct 6, 2026"),
    dayTotalLabel:
      customLabels?.dayTotalLabel ??
      (locale === "bn" ? "দিনের মোট:" : "Day total:"),
    perPersonCostLabel:
      customLabels?.perPersonCostLabel ??
      (locale === "bn" ? "জনপ্রতি এই দিনের খরচ:" : "Cost per person today:"),
    paidByPrefix:
      customLabels?.paidByPrefix ??
      (locale === "bn" ? "কে দিলেন:" : "Paid by:"),
    editBtn: customLabels?.editBtn ?? (locale === "bn" ? "এডিট" : "Edit"),
    deleteBtn:
      customLabels?.deleteBtn ?? (locale === "bn" ? "মুছুন" : "Delete"),
    settlementHeader:
      customLabels?.settlementHeader ??
      (locale === "bn" ? "হিসাব নিষ্পত্তি (Settlement)" : "Settlement Share"),
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
  const isPlaying =
    !isFrozen && !isManualPaused && !isOffScreen && !isTabHidden;

  // Single shared duration variable (15s timeline)
  const sharedDuration = "var(--demo-duration, 15s)";

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
          ? "রাতের ডিনার ১২০০ (তাহমিদুর দিল)"
          : "rater dinner 1200 paid by Tahmidur";

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
      scrollToAddExpense();
    }
  };

  const dayTotalFormatted = formatTaka(1200, locale);
  const costTahmidurFormatted = formatTaka(600, locale);
  const costRahmanFormatted = formatTaka(600, locale);
  const item1AmountFormatted = formatTaka(1200, locale);
  const item1ShareFormatted = formatTaka(600, locale);

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[480px] ${className.includes("mx-") ? "" : "mx-auto"} select-none overflow-hidden rounded-2xl min-[360px]:rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[#e8f5ef] via-[#f4faf6] to-white p-2.5 min-[360px]:p-3 sm:p-4 shadow-xs transition-shadow hover:shadow-md ${className}`}
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
      <div className="flex items-center justify-between pb-1.5 min-[360px]:pb-2 border-b border-[var(--color-border)]/60">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🎬</span>
          <span className="rounded-full bg-emerald-100 px-2 min-[360px]:px-2.5 py-0.5 text-[11px] min-[360px]:text-xs font-black text-emerald-900 border border-emerald-300 shadow-2xs">
            {labels.badge}
          </span>
          <span className="text-xs font-bold text-gray-700 hidden sm:inline">
            {locale === "bn" ? "কীভাবে কাজ করে দেখুন" : "Watch how it works"}
          </span>
        </div>

        {/* 36-44px accessible pause/play toggle */}
        <button
          type="button"
          onClick={() => setIsManualPaused((prev) => !prev)}
          aria-label={isPlaying ? labels.pause : labels.play}
          className="demo-pause-btn flex min-h-[36px] min-w-[36px] min-[360px]:min-h-[44px] min-[360px]:min-w-[44px] items-center justify-center rounded-xl text-neutral-500 hover:text-emerald-800 hover:bg-emerald-100/60 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-sm font-bold">{isPlaying ? "⏸" : "▶"}</span>
        </button>
      </div>

      {/* Main Scene: Responsive Height & Aspect Ratio for mobile & desktop */}
      <div className="relative mt-2 h-[325px] sm:h-auto sm:aspect-[4/3] sm:min-h-[340px] w-full max-w-full overflow-hidden rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-surface)] shadow-inner">
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
            className="demo-anim absolute inset-0 flex flex-col justify-between rounded-2xl border border-[var(--color-border)] bg-white p-2 min-[360px]:p-2.5 sm:p-3 shadow-xs"
            style={animStyle("demo-input-phase")}
          >
            {/* Real Card Header with Title, Subtitle, and AI Chip */}
            <div className="flex items-start justify-between gap-1.5 min-[360px]:gap-2 border-b border-gray-100 pb-1.5">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5 truncate">
                  <span className="text-emerald-600" aria-hidden="true">✨</span>
                  <span>{labels.cardTitle}</span>
                </p>
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

            {/* Real Textarea Card Container with typed line and bottom helper bar */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-2 sm:p-2.5 shadow-2xs space-y-1.5">
              {/* Single typed line (starts at top left like real textarea) */}
              <div className="text-xs sm:text-sm font-semibold text-[var(--color-fg)] min-h-[58px] pt-1 text-left">
                <div
                  className="demo-anim inline-block whitespace-nowrap overflow-hidden text-left"
                  style={animStyle("demo-type-line-1")}
                >
                  {labels.line1}
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
              Real Generated Draft Review Form Card with the exact same fields
              from AiExpenseParserCard, scrolling down smoothly
              ------------------------------------------------------------- */}
          <div
            className="demo-anim absolute inset-0 overflow-hidden rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-surface-muted)] p-1.5 min-[360px]:p-2 sm:p-2.5 shadow-xs"
            style={animStyle("demo-confirm-phase")}
          >
            {/* Scrollable Form Viewport gliding down smoothly to reveal bottom fields */}
            <div
              className="demo-anim space-y-2"
              style={animStyle("demo-form-scroll")}
            >
              {/* Top Draft Indicator Banner */}
              <div className="flex items-center justify-between gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2 min-[360px]:px-2.5 py-1 text-[11px] min-[360px]:text-xs font-bold text-emerald-950 shadow-2xs">
                <span className="flex items-center gap-1.5 truncate">
                  <span>👇</span>
                  <span className="truncate">{labels.draftBanner}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                  {labels.draftBadge}
                </span>
              </div>

              {/* The Real Add Expense Form Card with the Exact Fields */}
              <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-white p-2 min-[360px]:p-2.5 sm:p-3 shadow-xs">
                {/* 1. Header: Number badge | Category badge | Remove button */}
                <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-extrabold text-neutral-800">
                      1
                    </span>
                    <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-200">
                      {labels.categoryFood}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-neutral-400">
                    ✕ {locale === "bn" ? "মুছুন" : "Remove"}
                  </span>
                </div>

                {/* 2. What was it for? & Amount Grid */}
                <div className="grid grid-cols-12 gap-1.5 min-[360px]:gap-2">
                  <div className="col-span-7 sm:col-span-8 space-y-0.5">
                    <label className="block text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কিসের খরচ?" : "What was it for?"}
                    </label>
                    <div className="min-h-[30px] min-[360px]:min-h-[32px] sm:min-h-[34px] w-full rounded-xl border border-[var(--color-border)] bg-white px-2 min-[360px]:px-2.5 py-1 text-[11px] min-[360px]:text-xs font-semibold text-[var(--color-fg)] flex items-center shadow-2xs truncate">
                      {labels.item1Title}
                    </div>
                  </div>
                  <div className="col-span-5 sm:col-span-4 space-y-0.5">
                    <label className="block text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "টাকা (৳)" : "Amount (৳)"}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 min-[360px]:left-2.5 text-xs font-bold text-[var(--color-primary)]">
                        ৳
                      </span>
                      <div className="min-h-[30px] min-[360px]:min-h-[32px] sm:min-h-[34px] w-full rounded-xl border border-[var(--color-border)] bg-white pl-5 min-[360px]:pl-6 pr-1.5 py-1 text-[11px] min-[360px]:text-xs font-bold text-[var(--color-primary)] flex items-center shadow-2xs">
                        1,200
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Category & Who paid Grid */}
                <div className="grid grid-cols-2 gap-1.5 min-[360px]:gap-2">
                  <div className="space-y-0.5">
                    <label className="block text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "ক্যাটাগরি" : "Category"}
                    </label>
                    <div className="min-h-[30px] min-[360px]:min-h-[32px] sm:min-h-[34px] w-full rounded-xl border border-[var(--color-border)] bg-white px-2 min-[360px]:px-2.5 py-1 text-[11px] min-[360px]:text-xs font-medium text-gray-800 flex items-center justify-between shadow-2xs">
                      <span className="truncate">{labels.categoryFood}</span>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        ▾
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="block text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কে দিলেন?*" : "Who paid?*"}
                    </label>
                    <div className="min-h-[30px] min-[360px]:min-h-[32px] sm:min-h-[34px] w-full rounded-xl border border-[var(--color-border)] bg-white px-2 min-[360px]:px-2.5 py-1 text-[11px] min-[360px]:text-xs font-medium text-gray-800 flex items-center justify-between shadow-2xs">
                      <span className="flex items-center gap-1 truncate">
                        <span>🏔️</span>
                        <span className="truncate">{labels.member1}</span>
                      </span>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        ▾
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Date* */}
                <div className="space-y-0.5">
                  <label className="block text-[10px] sm:text-[11px] font-bold text-[var(--color-fg)]">
                    {locale === "bn" ? "তারিখ*" : "Date*"}
                  </label>
                  <div className="min-h-[30px] min-[360px]:min-h-[32px] sm:min-h-[34px] w-full rounded-xl border border-[var(--color-border)] bg-white px-2 min-[360px]:px-2.5 py-1 text-[11px] min-[360px]:text-xs font-medium text-gray-800 flex items-center justify-between shadow-2xs">
                    <span>
                      {locale === "bn" ? "৬ অক্টো, ২০২৬" : "Oct 6, 2026"}
                    </span>
                    <span className="text-xs text-neutral-400">📅</span>
                  </div>
                </div>

                {/* 5. Who shared this? */}
                <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-gray-50/80 p-1.5 min-[360px]:p-2 sm:p-2.5 text-[11px] min-[360px]:text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--color-fg)]">
                      {locale === "bn" ? "কারা ভাগ করবে?" : "Who shared this?"}
                    </span>
                    <span className="text-[11px] font-bold text-[var(--color-primary)]">
                      {locale === "bn" ? "সবাই" : "Everyone"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🏔️</span> <span>{labels.member1}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold bg-[var(--color-primary)] text-white shadow-2xs">
                      <span>🎒</span> <span>{labels.member2}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. + Add another expense */}
              <div className="pt-0.5">
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-primary)]/60 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] shadow-2xs">
                  <span>+</span>
                  <span>
                    {locale === "bn"
                      ? "আরেকটি খরচ যোগ করুন"
                      : "Add another expense"}
                  </span>
                </div>
              </div>

              {/* 7. Footer: 1 expense, total ৳1,200 + Add all */}
              <div className="flex items-center justify-between gap-1.5 min-[360px]:gap-2 border-t border-[var(--color-border)] pt-1.5 min-[360px]:pt-2 sm:pt-2.5">
                <div className="text-[11px] min-[360px]:text-xs sm:text-sm font-bold text-[var(--color-fg)] shrink-0 whitespace-nowrap">
                  {labels.footerSummary}
                </div>
                <div
                  className="demo-anim rounded-full bg-[#0f6b4a] text-white font-bold px-2.5 min-[360px]:px-3.5 py-1 min-[360px]:py-1.5 text-[11px] min-[360px]:text-xs sm:text-sm shadow-xs cursor-pointer select-none shrink-0 whitespace-nowrap"
                  style={animStyle("demo-add-all-tap")}
                >
                  ✓ {labels.addAllButton}
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              PHASE 3 (9.6s - 14.5s):
              Real Daily Expenses (দৈনিক খরচ) section copying PerDayExpensesView.tsx
              ------------------------------------------------------------- */}
          <div
            className="demo-anim absolute inset-0 flex flex-col justify-between rounded-2xl border-2 border-emerald-400 bg-emerald-50/95 p-2 min-[360px]:p-2.5 sm:p-3 shadow-md"
            style={animStyle("demo-success-phase")}
          >
            {/* Top Success Banner */}
            <div className="flex items-center justify-between gap-1.5 rounded-xl border border-emerald-300 bg-white px-2 min-[360px]:px-2.5 py-1 text-[10.5px] min-[360px]:text-[11px] font-bold text-emerald-900 shadow-2xs">
              <div className="flex items-center gap-1.5 truncate">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-extrabold text-white shrink-0">
                  ✓
                </span>
                <span className="truncate">{labels.addedSuccess}</span>
              </div>
              <span className="text-neutral-400 text-xs shrink-0">✕</span>
            </div>

            {/* Real Daily Expenses Card matching PerDayExpensesView */}
            <div className="my-auto space-y-2 rounded-2xl border border-[var(--color-border)] bg-white p-2 min-[360px]:p-2.5 sm:p-3 shadow-xs">
              {/* Section Header: 🧾 দৈনিক খরচ (Daily expenses) */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-[var(--color-fg)]">
                  <span>🧾</span>
                  <span>{labels.dailyExpensesTitle}</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-1.5 min-[360px]:px-2 py-0.5 text-[9.5px] min-[360px]:text-[10px] font-black text-emerald-900 border border-emerald-200">
                  <span>{labels.dayTotalLabel}</span>
                  <span>{dayTotalFormatted}</span>
                </div>
              </div>

              {/* Day Title */}
              <div className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--color-fg)]">
                <span>🗓️</span>
                <span>{labels.day1Label}</span>
              </div>

              {/* Cost per person today pills */}
              <div className="space-y-0.5">
                <p className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-wider">
                  {labels.perPersonCostLabel}
                </p>
                <div className="flex flex-wrap gap-1 text-[9px] min-[360px]:text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-neutral-50 px-1.5 py-0.5 font-semibold text-gray-700">
                    <span>🏔️ {labels.member1}:</span>
                    <strong className="font-extrabold text-[var(--color-primary)]">
                      {costTahmidurFormatted}
                    </strong>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-neutral-50 px-1.5 py-0.5 font-semibold text-gray-700">
                    <span>🎒 {labels.member2}:</span>
                    <strong className="font-extrabold text-[var(--color-primary)]">
                      {costRahmanFormatted}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Real Expense Row in Daily Expenses */}
              <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-neutral-50/60 p-1.5 min-[360px]:p-2 shadow-2xs">
                <div className="flex items-start justify-between gap-1.5 min-[360px]:gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-white px-1.5 py-0.2 text-[9px] font-bold text-gray-700 border border-gray-200">
                        {labels.categoryFood}
                      </span>
                      <span className="text-[11px] min-[360px]:text-xs font-bold text-[var(--color-fg)] truncate">
                        {labels.item1Title}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      {labels.paidByPrefix}{" "}
                      <strong className="text-gray-700">
                        🏔️ {labels.member1}
                      </strong>
                    </p>
                  </div>

                  <div className="text-xs min-[360px]:text-sm font-black text-[var(--color-fg)] shrink-0">
                    {item1AmountFormatted}
                  </div>
                </div>

                {/* Individual share pills + Edit / Delete buttons */}
                <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5 pt-1 border-t border-gray-200/60 text-[8.5px] min-[360px]:text-[9px]">
                  <div className="flex flex-wrap items-center gap-1 min-[360px]:gap-1.5 text-neutral-600 font-medium">
                    <span>
                      🏔️ {labels.member1}:{" "}
                      <strong className="font-bold text-[var(--color-primary)]">
                        {item1ShareFormatted}
                      </strong>
                    </span>
                    <span>
                      🎒 {labels.member2}:{" "}
                      <strong className="font-bold text-[var(--color-primary)]">
                        {item1ShareFormatted}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-400 shrink-0 font-medium">
                    <span>✏️ {labels.editBtn}</span>
                    <span>🗑️ {labels.deleteBtn}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Try It Yourself Primary Action Button */}
            {mode === "landing" ? (
              <Link
                href="/trips/new"
                className="inline-flex min-h-[36px] sm:min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0f6b4a] px-3 py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
              >
                🚀 {labels.tryYourself}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleTrySelf}
                className="inline-flex min-h-[36px] sm:min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0f6b4a] px-3 py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
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
          className="demo-reduced-show hidden flex-col justify-between h-full w-full rounded-2xl border-2 border-emerald-400 bg-emerald-50/95 p-2 min-[360px]:p-2.5 sm:p-3 shadow-md"
        >
          {/* Top Success Banner */}
          <div className="flex items-center justify-between gap-1.5 rounded-xl border border-emerald-300 bg-white px-2 min-[360px]:px-2.5 py-1 text-[10.5px] min-[360px]:text-[11px] font-bold text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                ✓
              </span>
              <span>{labels.addedSuccess}</span>
            </div>
            <span className="text-neutral-400 text-xs">✕</span>
          </div>

          {/* Daily Expenses View in Static Frame */}
          <div className="my-auto space-y-2 rounded-2xl border border-[var(--color-border)] bg-white p-2 min-[360px]:p-2.5 sm:p-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-[var(--color-fg)]">
                <span>🧾</span>
                <span>{labels.dailyExpensesTitle}</span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-1.5 min-[360px]:px-2 py-0.5 text-[9.5px] min-[360px]:text-[10px] font-black text-emerald-900 border border-emerald-200">
                <span>{labels.dayTotalLabel}</span>
                <span>{dayTotalFormatted}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--color-fg)]">
              <span>🗓️</span>
              <span>{labels.day1Label}</span>
            </div>

            <div className="space-y-0.5">
              <p className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-wider">
                {labels.perPersonCostLabel}
              </p>
              <div className="flex flex-wrap gap-1 text-[9px] min-[360px]:text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-neutral-50 px-1.5 py-0.5 font-semibold text-gray-700">
                  <span>🏔️ {labels.member1}:</span>
                  <strong className="font-extrabold text-[var(--color-primary)]">
                    {costTahmidurFormatted}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-neutral-50 px-1.5 py-0.5 font-semibold text-gray-700">
                  <span>🎒 {labels.member2}:</span>
                  <strong className="font-extrabold text-[var(--color-primary)]">
                    {costRahmanFormatted}
                  </strong>
                </span>
              </div>
            </div>

            <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-neutral-50/60 p-1.5 min-[360px]:p-2 shadow-2xs">
              <div className="flex items-start justify-between gap-1.5 min-[360px]:gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-white px-1.5 py-0.2 text-[9px] font-bold text-gray-700 border border-gray-200">
                      {labels.categoryFood}
                    </span>
                    <span className="text-[11px] min-[360px]:text-xs font-bold text-[var(--color-fg)] truncate">
                      {labels.item1Title}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    {labels.paidByPrefix}{" "}
                    <strong className="text-gray-700">
                      🏔️ {labels.member1}
                    </strong>
                  </p>
                </div>
                <div className="text-xs min-[360px]:text-sm font-black text-[var(--color-fg)] shrink-0">
                  {item1AmountFormatted}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5 pt-1 border-t border-gray-200/60 text-[8.5px] min-[360px]:text-[9px]">
                <div className="flex flex-wrap items-center gap-1 min-[360px]:gap-1.5 text-neutral-600 font-medium">
                  <span>
                    🏔️ {labels.member1}:{" "}
                    <strong className="font-bold text-[var(--color-primary)]">
                      {item1ShareFormatted}
                    </strong>
                  </span>
                  <span>
                    🎒 {labels.member2}:{" "}
                    <strong className="font-bold text-[var(--color-primary)]">
                      {item1ShareFormatted}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-400 shrink-0 font-medium">
                  <span>✏️ {labels.editBtn}</span>
                  <span>🗑️ {labels.deleteBtn}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          {mode === "landing" ? (
            <Link
              href="/trips/new"
              className="mt-1 inline-flex min-h-[36px] sm:min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0f6b4a] py-1.5 text-center text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
            >
              🚀 {labels.tryYourself}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleTrySelf}
              className="mt-1 inline-flex min-h-[36px] sm:min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0f6b4a] py-1.5 text-center text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c593d] transition-all cursor-pointer"
            >
              ✍️ {labels.tryYourself}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
