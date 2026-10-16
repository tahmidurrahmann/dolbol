export const TRIP_TZ = "Asia/Dhaka" as const;

const dhakaDayPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRIP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the YYYY-MM-DD calendar date as observed in Asia/Dhaka (UTC+6),
 * never UTC or the host machine's local time zone.
 */
export function dayKey(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid Date provided to dayKey.");
  }

  const parts = dhakaDayPartsFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format date parts in Asia/Dhaka time zone.");
  }

  return `${year}-${month}-${day}`;
}
