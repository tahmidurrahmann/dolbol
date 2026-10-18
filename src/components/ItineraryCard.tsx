"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addItineraryItemAction,
  deleteItineraryItemAction,
  moveItineraryItemAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
import type { SupportedLocale } from "@/lib/format";
import type { ItineraryDayGroup } from "@/lib/planning";

export interface ItineraryCardLabels {
  itineraryTitle: string;
  itinerarySubtitle: string;
  noItineraryYet: string;
  dayNumberLabel: string;
  timeLabel: string;
  timePlaceholder: string;
  activityTitleLabel: string;
  activityTitlePlaceholder: string;
  activityNotesLabel: string;
  activityNotesPlaceholder: string;
  addItineraryButton: string;
  moveUp: string;
  moveDown: string;
  deleteItem: string;
}

interface ItineraryCardProps {
  slug: string;
  locale?: SupportedLocale;
  isLocked: boolean;
  dayGroups: ItineraryDayGroup[];
  labels: ItineraryCardLabels;
}

export function ItineraryCard({
  slug,
  locale = "bn",
  isLocked,
  dayGroups,
  labels,
}: ItineraryCardProps) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("itemId", target.id);
      await deleteItineraryItemAction(formData);
    } catch {
      // Handled by Next.js redirect
    } finally {
      setIsDeleting(false);
      router.refresh();
    }
  };
  return (
    <div className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)] flex items-center gap-2">
          <span>📅</span>
          <span>{labels.itineraryTitle}</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400">
          {labels.itinerarySubtitle}
        </p>
      </div>

      {/* Add new itinerary item form */}
      {!isLocked ? (
        <form
          action={addItineraryItemAction}
          className="space-y-3.5 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-2xs"
        >
          <input type="hidden" name="slug" value={slug} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="it-day"
                className="block text-xs font-bold text-[var(--color-fg)]"
              >
                {labels.dayNumberLabel}
                <span className="ml-1 font-bold text-red-500">*</span>
              </label>
              <input
                id="it-day"
                name="dayNumber"
                type="text"
                inputMode="numeric"
                required
                defaultValue="1"
                className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-base font-bold text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="it-time"
                className="block text-xs font-bold text-[var(--color-fg)]"
              >
                {labels.timeLabel}
              </label>
              <input
                id="it-time"
                name="time"
                type="text"
                maxLength={20}
                placeholder={labels.timePlaceholder}
                className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-title"
              className="block text-xs font-bold text-[var(--color-fg)]"
            >
              {labels.activityTitleLabel}
              <span className="ml-1 font-bold text-red-500">*</span>
            </label>
            <input
              id="it-title"
              name="title"
              type="text"
              required
              maxLength={120}
              placeholder={labels.activityTitlePlaceholder}
              className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-base font-medium text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-notes"
              className="block text-xs font-bold text-[var(--color-fg)]"
            >
              {labels.activityNotesLabel}
            </label>
            <input
              id="it-notes"
              name="notes"
              type="text"
              maxLength={300}
              placeholder={labels.activityNotesPlaceholder}
              className="min-h-[44px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-sm text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>

          <Button type="submit" variant="primary">
            {labels.addItineraryButton}
          </Button>
        </form>
      ) : null}

      {/* Day-by-day list */}
      {dayGroups.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-center text-sm text-[var(--color-fg-muted)]">
          {labels.noItineraryYet}
        </p>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((group) => (
            <div
              key={group.dayNumber}
              className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5"
            >
              <h3 className="border-b border-[var(--color-border)] pb-1.5 text-base font-bold text-[var(--color-primary)]">
                {group.label}
              </h3>

              <ol className="space-y-2">
                {group.items.map((item, idx) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-white p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.time ? (
                          <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-primary)]">
                            🕘 {item.time}
                          </span>
                        ) : null}
                        <span className="font-semibold text-[var(--color-fg)]">
                          {item.title}
                        </span>
                      </div>
                      {item.notes ? (
                        <p className="text-xs text-[var(--color-fg-muted)]">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    {!isLocked ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {idx > 0 ? (
                          <form action={moveItineraryItemAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="itemId"
                              value={item.id}
                            />
                            <input type="hidden" name="direction" value="up" />
                            <button
                              type="submit"
                              aria-label="Move up"
                              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-fg)]"
                            >
                              {labels.moveUp}
                            </button>
                          </form>
                        ) : null}

                        {idx < group.items.length - 1 ? (
                          <form action={moveItineraryItemAction}>
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="itemId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="direction"
                              value="down"
                            />
                            <button
                              type="submit"
                              aria-label="Move down"
                              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs font-bold text-[var(--color-fg)]"
                            >
                              {labels.moveDown}
                            </button>
                          </form>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({
                              id: item.id,
                              title: item.title,
                            })
                          }
                          className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer active:scale-95 transition-all"
                        >
                          <span>🗑️</span>
                          <span>{labels.deleteItem}</span>
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* Floating Delete Itinerary Item Confirmation Toast */}
      {pendingDelete ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed bottom-20 min-[1000px]:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="rounded-2xl border border-rose-200 bg-white/95 p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5 ring-1 ring-black/5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-xl text-rose-600">
                🗑️
              </span>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900">
                  {locale === "bn"
                    ? "এই আইটেমটি মুছে ফেলতে চান?"
                    : "Delete this itinerary item?"}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  <span className="font-bold text-gray-950">
                    &ldquo;{pendingDelete.title}&rdquo;
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="rounded-full px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {locale === "bn" ? "বাতিল" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-black text-white shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>{locale === "bn" ? "মুছছে..." : "Deleting..."}</span>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>
                      {locale === "bn" ? "মুছে ফেলুন" : "Confirm Delete"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
