import {
  addItineraryItemAction,
  deleteItineraryItemAction,
  moveItineraryItemAction,
} from "@/app/trips/actions";
import { Button } from "@/components/Button";
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
  isLocked: boolean;
  dayGroups: ItineraryDayGroup[];
  labels: ItineraryCardLabels;
}

export function ItineraryCard({
  slug,
  isLocked,
  dayGroups,
  labels,
}: ItineraryCardProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-fg)]">
          {labels.itineraryTitle}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {labels.itinerarySubtitle}
        </p>
      </div>

      {/* Add new itinerary item form */}
      {!isLocked ? (
        <form
          action={addItineraryItemAction}
          className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5"
        >
          <input type="hidden" name="slug" value={slug} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="it-day"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.dayNumberLabel}
              </label>
              <input
                id="it-day"
                name="dayNumber"
                type="text"
                inputMode="numeric"
                required
                defaultValue="1"
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base font-semibold text-[var(--color-fg)]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="it-time"
                className="block text-xs font-semibold text-[var(--color-fg)]"
              >
                {labels.timeLabel}
              </label>
              <input
                id="it-time"
                name="time"
                type="text"
                maxLength={20}
                placeholder={labels.timePlaceholder}
                className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-title"
              className="block text-xs font-semibold text-[var(--color-fg)]"
            >
              {labels.activityTitleLabel}
            </label>
            <input
              id="it-title"
              name="title"
              type="text"
              required
              maxLength={120}
              placeholder={labels.activityTitlePlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="it-notes"
              className="block text-xs font-semibold text-[var(--color-fg)]"
            >
              {labels.activityNotesLabel}
            </label>
            <input
              id="it-notes"
              name="notes"
              type="text"
              maxLength={300}
              placeholder={labels.activityNotesPlaceholder}
              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm text-[var(--color-fg)]"
            />
          </div>

          <Button type="submit" variant="secondary">
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

                        <form action={deleteItineraryItemAction}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            {labels.deleteItem}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
