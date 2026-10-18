"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, type SupportedLocale, toBanglaDigits } from "@/lib/format";
import { dayKey } from "@/lib/time";

export type DatePickerPlacement = "auto" | "up" | "down";

interface DatePickerFieldProps {
  id?: string;
  name: string;
  value: string; // YYYY-MM-DD
  onChange?: (val: string) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  locale?: SupportedLocale;
  showQuickPills?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  className?: string;
  helperText?: string;
  placement?: DatePickerPlacement;
}

const MONTH_NAMES_BN = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS_BN = ["শনি", "রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র"];
const WEEKDAYS_EN = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function parseYyyyMmDd(str: string): {
  year: number;
  month: number;
  day: number;
} {
  const now = new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }
  const parts = str.split("-").map(Number);
  const y = parts[0] ?? now.getFullYear();
  const m = parts[1] !== undefined ? parts[1] - 1 : now.getMonth();
  const d = parts[2] ?? now.getDate();
  return { year: y, month: m, day: d };
}

function formatYyyyMmDd(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function DatePickerField({
  id: explicitId,
  name,
  value,
  onChange,
  label,
  required = false,
  error = null,
  locale = "bn",
  showQuickPills = true,
  min,
  max,
  className = "",
  helperText,
  placement = "auto",
}: DatePickerFieldProps) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;
  const isBn = locale === "bn";

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [viewMode, setViewMode] = useState<"days" | "monthYear">("days");

  // Month & Year currently viewed in the calendar popup
  const initial = parseYyyyMmDd(value || dayKey(new Date()));
  const [viewYear, setViewYear] = useState<number>(initial.year);
  const [viewMonth, setViewMonth] = useState<number>(initial.month);

  const selectedYearRef = useRef<HTMLButtonElement>(null);
  const yearScrollRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => {
    const curY = new Date().getFullYear();
    const minY = min ? Number(min.slice(0, 4)) : curY - 20;
    const maxY = max ? Number(max.slice(0, 4)) : curY + 25;
    const fromY = Math.min(curY - 20, Number.isFinite(minY) ? minY : curY - 20);
    const toY = Math.max(curY + 25, Number.isFinite(maxY) ? maxY : curY + 25);
    const list: number[] = [];
    for (let y = fromY; y <= toY; y++) {
      list.push(y);
    }
    return list;
  }, [min, max]);

  useEffect(() => {
    if (viewMode === "monthYear" && selectedYearRef.current) {
      selectedYearRef.current.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "auto",
      });
    }
  }, [viewMode, viewYear]);

  const handleYearWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  const computeDirection = useCallback(() => {
    if (typeof window === "undefined" || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setAlignRight(rect.left + 300 > window.innerWidth);

    if (placement === "up") {
      setOpenUpward(true);
    } else if (placement === "down") {
      setOpenUpward(false);
    } else {
      // placement === "auto" (default)
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Popover height is ~370px. If space below is less than 400px and space above has more room,
      // open upward so the entire calendar is visible without scrolling!
      const shouldOpenUp = spaceBelow < 400 && spaceAbove > spaceBelow;
      setOpenUpward(shouldOpenUp);
    }
  }, [placement]);

  function openDropdown() {
    const parsed = parseYyyyMmDd(value || dayKey(new Date()));
    setViewYear(parsed.year);
    setViewMonth(parsed.month);
    setViewMode("days");
    computeDirection();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setViewMode("days");
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }
    function handlePositionUpdate() {
      computeDirection();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handlePositionUpdate);
    window.addEventListener("scroll", handlePositionUpdate, { passive: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handlePositionUpdate);
      window.removeEventListener("scroll", handlePositionUpdate);
    };
  }, [open, computeDirection]);

  function handleSelectDate(year: number, month: number, day: number) {
    const dateStr = formatYyyyMmDd(year, month, day);
    if ((min && dateStr < min) || (max && dateStr > max)) return;
    onChange?.(dateStr);
    close();
  }

  function handlePrevMonth() {
    setViewMonth((prevM) => {
      if (prevM === 0) {
        setViewYear((prevY) => prevY - 1);
        return 11;
      }
      return prevM - 1;
    });
  }

  function handleNextMonth() {
    setViewMonth((prevM) => {
      if (prevM === 11) {
        setViewYear((prevY) => prevY + 1);
        return 0;
      }
      return prevM + 1;
    });
  }

  function handleQuickSet(target: "today" | "yesterday") {
    const now = new Date();
    const targetDate =
      target === "today" ? now : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = dayKey(targetDate);
    if ((min && dateStr < min) || (max && dateStr > max)) return;
    onChange?.(dateStr);
  }

  // Days in current month
  const daysInMonth = useMemo(() => {
    return new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  }, [viewYear, viewMonth]);

  // Starting weekday of current month (0 = Sun, 1 = Mon... 6 = Sat)
  // Shift Sunday (0) to 1, Saturday (6) to 0 so week starts Saturday
  const startDayOffset = useMemo(() => {
    const sunDay = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    return (sunDay + 1) % 7;
  }, [viewYear, viewMonth]);

  // Formatted display text on the button
  const formattedDisplay = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return isBn ? "তারিখ নির্বাচন করুন" : "Select date";
    }
    try {
      const parsed = new Date(`${value}T12:00:00+06:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return formatDate(parsed, locale);
      }
    } catch {
      // Fallback
    }
    return value;
  }, [value, locale, isBn]);

  const todayStr = dayKey(new Date());
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }, []);

  const monthLabel = isBn
    ? `${MONTH_NAMES_BN[viewMonth] ?? ""} ${toBanglaDigits(viewYear)}`
    : `${MONTH_NAMES_EN[viewMonth] ?? ""} ${viewYear}`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-[var(--color-fg)]"
          >
            {label}
            {required ? (
              <span className="ml-1 font-bold text-red-500" title="Required">
                *
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      <div className="relative">
        {/* Hidden Input for Form & Server Actions */}
        <input type="hidden" id={inputId} name={name} value={value ?? ""} />

        {/* Custom Calendar Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close() : openDropdown())}
          className={`flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-xl border bg-white px-3.5 py-2 text-left text-sm transition-all outline-none cursor-pointer ${
            error
              ? "border-red-400 bg-red-50/20 ring-2 ring-red-400/20"
              : open
                ? "border-gray-400 ring-2 ring-gray-200 shadow-2xs"
                : "border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <span className="text-base select-none">🗓️</span>
            <span className="truncate font-medium text-gray-800">
              {formattedDisplay}
            </span>
          </div>

          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-gray-400 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </button>

        {open ? (
          <>
            {/* Click-away backdrop */}
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={close}
              aria-hidden="true"
            />

            {/* Floating Calendar Popover */}
            <div
              role="dialog"
              aria-label={label ?? "Calendar"}
              className={`absolute ${
                alignRight ? "right-0" : "left-0"
              } ${
                openUpward
                  ? "bottom-full mb-2 origin-bottom slide-in-from-bottom-2"
                  : "top-full mt-2 origin-top slide-in-from-top-2"
              } w-full min-w-[280px] max-w-xs z-50 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150`}
            >
              {viewMode === "monthYear" ? (
                /* Year & Month Selection Mode */
                <div className="space-y-3">
                  {/* Mode Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => setViewMode("days")}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-gray-900 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <span>←</span>
                      <span>{isBn ? "ক্যালেন্ডার" : "Calendar"}</span>
                    </button>
                    <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                      {isBn ? "বছর ও মাস" : "Year & Month"}
                    </span>
                  </div>

                  {/* Scroll-based Year Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        {isBn ? "বছর নির্বাচন:" : "Select Year:"}
                      </div>
                      {/* Quick Dropdown Select */}
                      <select
                        value={viewYear}
                        onChange={(e) => setViewYear(Number(e.target.value))}
                        aria-label={isBn ? "বছর বাছুন" : "Select year"}
                        className="rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-0.5 text-xs font-bold text-gray-700 outline-none hover:bg-white focus:border-[#0f6b4a] focus:bg-white cursor-pointer"
                      >
                        {availableYears.map((y) => (
                          <option
                            key={y}
                            value={y}
                            disabled={Boolean(
                              (min && y < Number(min.slice(0, 4))) ||
                                (max && y > Number(max.slice(0, 4))),
                            )}
                          >
                            {isBn ? toBanglaDigits(y) : y}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Scrollable Years Strip (Scroll with mouse wheel or touch swipe, click to select) */}
                    <div className="relative">
                      {/* Left fade indicator */}
                      <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-4 bg-gradient-to-r from-white to-transparent" />

                      <div
                        ref={yearScrollRef}
                        onWheel={handleYearWheel}
                        className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-3 no-scrollbar scroll-smooth"
                        tabIndex={0}
                        role="region"
                        aria-label={isBn ? "বছর স্ক্রল করুন" : "Scroll years"}
                      >
                        {availableYears.map((y) => {
                          const isCurYear = y === viewYear;
                          const isYearDisabled = Boolean(
                            (min && y < Number(min.slice(0, 4))) ||
                              (max && y > Number(max.slice(0, 4))),
                          );
                          return (
                            <button
                              key={y}
                              ref={isCurYear ? selectedYearRef : undefined}
                              type="button"
                              disabled={isYearDisabled}
                              onClick={() => setViewYear(y)}
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all select-none cursor-pointer ${
                                isYearDisabled
                                  ? "opacity-25 cursor-not-allowed bg-gray-50 text-gray-400"
                                  : isCurYear
                                    ? "bg-[#0f6b4a] text-white font-black shadow-xs scale-105 ring-2 ring-emerald-600/30"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 active:scale-95"
                              }`}
                            >
                              {isBn ? toBanglaDigits(y) : y}
                            </button>
                          );
                        })}
                      </div>

                      {/* Right fade indicator */}
                      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-4 bg-gradient-to-l from-white to-transparent" />
                    </div>
                  </div>

                  {/* 12-Months Grid */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      {isBn ? "মাস নির্বাচন:" : "Select Month:"}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(isBn ? MONTH_NAMES_BN : MONTH_NAMES_EN).map((mName, idx) => {
                        const isCurMonth = idx === viewMonth;
                        return (
                          <button
                            key={mName}
                            type="button"
                            onClick={() => {
                              setViewMonth(idx);
                              setViewMode("days");
                            }}
                            className={`rounded-xl px-2 py-2 text-xs font-bold transition-all text-center cursor-pointer ${
                              isCurMonth
                                ? "bg-[#e8f5ee] border border-emerald-300 text-[#0f6b4a] font-black shadow-2xs scale-102"
                                : "bg-gray-50 text-gray-700 border border-gray-100 hover:bg-gray-100 hover:border-gray-200"
                            }`}
                          >
                            {mName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Month-Year Footer */}
                  <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setViewYear(now.getFullYear());
                        setViewMonth(now.getMonth());
                        setViewMode("days");
                      }}
                      className="font-bold text-[#0f6b4a] hover:underline cursor-pointer"
                    >
                      {isBn ? "চলতি মাস" : "Current month"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("days")}
                      className="font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
                    >
                      {isBn ? "দিন বাছুন →" : "Pick day →"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Regular Calendar Days Mode */
                <>
                  {/* Month & Year Navigation Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      aria-label="Previous month"
                      className="flex size-8 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                    >
                      ◀
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode("monthYear")}
                      aria-label={isBn ? "বছর ও মাস পরিবর্তন করুন" : "Change year and month"}
                      className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-black text-gray-900 hover:bg-emerald-50 hover:text-[#0f6b4a] transition-all cursor-pointer"
                    >
                      <span>{monthLabel}</span>
                      <span className="text-[10px] text-gray-400 group-hover:text-[#0f6b4a]">
                        ▾
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      aria-label="Next month"
                      className="flex size-8 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Weekdays Header */}
                  <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-xs font-bold text-gray-400 select-none">
                    {(isBn ? WEEKDAYS_BN : WEEKDAYS_EN).map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1 pt-1">
                    {Array.from({ length: startDayOffset }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-8 w-8" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateStr = formatYyyyMmDd(viewYear, viewMonth, dayNum);
                      const isSelected = dateStr === value;
                      const isToday = dateStr === todayStr;

                      const isDisabled =
                        (min && dateStr < min) || (max && dateStr > max);

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={Boolean(isDisabled)}
                          onClick={() =>
                            handleSelectDate(viewYear, viewMonth, dayNum)
                          }
                          className={`flex size-8 items-center justify-center rounded-xl text-xs font-bold transition-all select-none cursor-pointer ${
                            isDisabled
                              ? "opacity-25 cursor-not-allowed text-gray-400"
                              : isSelected
                                ? "bg-[#1a73e8] text-white shadow-xs scale-105"
                                : isToday
                                  ? "bg-blue-50 text-blue-700 font-extrabold hover:bg-blue-100"
                                  : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {isBn ? toBanglaDigits(dayNum) : dayNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Today & Clear Buttons inside Calendar Footer */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={Boolean((min && todayStr < min) || (max && todayStr > max))}
                        onClick={() => {
                          const now = new Date();
                          handleSelectDate(
                            now.getFullYear(),
                            now.getMonth(),
                            now.getDate(),
                          );
                        }}
                        className={`font-bold text-blue-600 hover:underline cursor-pointer ${
                          (min && todayStr < min) || (max && todayStr > max)
                            ? "opacity-30 cursor-not-allowed pointer-events-none"
                            : ""
                        }`}
                      >
                        {isBn ? "আজকের দিন" : "Today"}
                      </button>

                      {value && !required ? (
                        <button
                          type="button"
                          onClick={() => {
                            onChange?.("");
                            close();
                          }}
                          className="font-semibold text-red-500 hover:text-red-700 hover:underline cursor-pointer"
                        >
                          {isBn ? "মুছুন" : "Clear"}
                        </button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={close}
                      className="font-medium text-gray-500 hover:text-gray-900 cursor-pointer"
                    >
                      {isBn ? "বন্ধ করুন" : "Close"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {showQuickPills ? (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
          <span className="text-xs text-gray-500">
            {isBn ? "দ্রুত বাছুন:" : "Quick pick:"}
          </span>
          <button
            type="button"
            disabled={Boolean((min && todayStr < min) || (max && todayStr > max))}
            onClick={() => handleQuickSet("today")}
            className={`rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition-colors active:scale-95 cursor-pointer ${
              (min && todayStr < min) || (max && todayStr > max)
                ? "opacity-30 cursor-not-allowed pointer-events-none"
                : ""
            }`}
          >
            {isBn ? "+ আজ" : "+ Today"}
          </button>
          <button
            type="button"
            disabled={Boolean(
              (min && yesterdayStr < min) || (max && yesterdayStr > max),
            )}
            onClick={() => handleQuickSet("yesterday")}
            className={`rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition-colors active:scale-95 cursor-pointer ${
              (min && yesterdayStr < min) || (max && yesterdayStr > max)
                ? "opacity-30 cursor-not-allowed pointer-events-none"
                : ""
            }`}
          >
            {isBn ? "+ গতকাল" : "+ Yesterday"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-red-600">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-[var(--color-fg-muted)]">{helperText}</p>
      ) : null}
    </div>
  );
}
