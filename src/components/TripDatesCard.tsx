"use client";

import { useState } from "react";
import { updateTripDatesAction } from "@/app/trips/actions";
import { DatePickerField } from "@/components/DatePickerField";
import { formatDate, type SupportedLocale } from "@/lib/format";

export interface TripDatesCardLabels {
  datesTitle: string;
  datesSubtitle: string;
  datesNotSet: string;
  editDatesButton: string;
  setDatesButton: string;
  saveDatesButton: string;
  cancelButton: string;
  startDateLabel: string;
  endDateLabel: string;
  invalidDatesError?: string;
}

interface TripDatesCardProps {
  slug: string;
  locale: SupportedLocale;
  isLocked: boolean;
  isCreator: boolean;
  startDateYyyyMmDd: string | null;
  endDateYyyyMmDd: string | null;
  dateRangeLabel: string | null;
  labels: TripDatesCardLabels;
}

export function TripDatesCard({
  slug,
  locale,
  isLocked,
  isCreator,
  startDateYyyyMmDd,
  endDateYyyyMmDd,
  dateRangeLabel,
  labels,
}: TripDatesCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [startDate, setStartDate] = useState(startDateYyyyMmDd ?? "");
  const [endDate, setEndDate] = useState(endDateYyyyMmDd ?? "");

  const hasDates = Boolean(startDateYyyyMmDd || endDateYyyyMmDd);
  const hasDateOrderError = Boolean(
    startDate && endDate && startDate > endDate,
  );

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
            <span>🗓️</span>
            <span>{labels.datesTitle}</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400">
            {labels.datesSubtitle}
          </p>
        </div>

        {!isEditing && isCreator && !isLocked ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-fg)] shadow-2xs hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            {hasDates ? labels.editDatesButton : labels.setDatesButton}
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-2xs space-y-3">
          {hasDates && dateRangeLabel ? (
            <>
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-800 border border-emerald-200">
                  📅
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-neutral-400 block uppercase tracking-wider">
                    {labels.datesTitle}
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-900 tracking-tight break-words">
                    {dateRangeLabel}
                  </span>
                </div>
              </div>

              {/* Two rows on desktop (>=1024px), side-by-side when <1024px */}
              {startDateYyyyMmDd || endDateYyyyMmDd ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 pt-2.5 border-t border-[var(--color-border)]/60 text-xs">
                  <div className="flex items-center justify-between bg-[var(--color-surface-muted)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]/50">
                    <span className="font-semibold text-neutral-500">
                      {labels.startDateLabel}:
                    </span>
                    <span className="font-bold text-[var(--color-fg)]">
                      {startDateYyyyMmDd
                        ? formatDate(
                            new Date(`${startDateYyyyMmDd}T00:00:00+06:00`),
                            locale,
                          )
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[var(--color-surface-muted)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]/50">
                    <span className="font-semibold text-neutral-500">
                      {labels.endDateLabel}:
                    </span>
                    <span className="font-bold text-[var(--color-fg)]">
                      {endDateYyyyMmDd
                        ? formatDate(
                            new Date(`${endDateYyyyMmDd}T00:00:00+06:00`),
                            locale,
                          )
                        : "—"}
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 text-sm text-[var(--color-fg-muted)]">
              <span className="flex items-center gap-2">
                <span>🗓️</span>
                <span>{labels.datesNotSet}</span>
              </span>
              {isCreator && !isLocked ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
                >
                  + {labels.setDatesButton}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <form
          action={updateTripDatesAction}
          onSubmit={(e) => {
            if (hasDateOrderError) {
              e.preventDefault();
            }
          }}
          className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:p-5 shadow-2xs"
        >
          <input type="hidden" name="slug" value={slug} />

          {/* Start and End date: Two rows on desktop (>=1024px: lg:grid-cols-1), side-by-side when <1024px (sm:grid-cols-2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            <DatePickerField
              name="startDate"
              value={startDate}
              onChange={setStartDate}
              label={labels.startDateLabel}
              locale={locale}
            />

            <DatePickerField
              name="endDate"
              value={endDate}
              onChange={setEndDate}
              min={startDate || undefined}
              label={labels.endDateLabel}
              locale={locale}
            />
          </div>

          {/* Validation error notice if start date > end date */}
          {hasDateOrderError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-800 animate-in fade-in"
            >
              <span className="shrink-0 text-sm">⚠️</span>
              <span className="leading-relaxed">
                {labels.invalidDatesError ??
                  (locale === "bn"
                    ? "শেষের তারিখ শুরুর তারিখের আগের হতে পারবে না।"
                    : "End date cannot be earlier than start date.")}
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => {
                setStartDate(startDateYyyyMmDd ?? "");
                setEndDate(endDateYyyyMmDd ?? "");
                setIsEditing(false);
              }}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all cursor-pointer"
            >
              {labels.cancelButton}
            </button>
            <button
              type="submit"
              disabled={hasDateOrderError}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✓ {labels.saveDatesButton}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
