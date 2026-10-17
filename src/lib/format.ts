import { TRIP_TZ } from "@/lib/time";

export type SupportedLocale = "bn" | "en";

const BANGLA_DIGITS: readonly string[] = [
  "০",
  "১",
  "২",
  "৩",
  "৪",
  "৫",
  "৬",
  "৭",
  "৮",
  "৯",
];

/**
 * Replaces ASCII digits (0-9) in a string or number with Bangla digits (০-৯).
 */
export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => {
    const index = Number(digit);
    return BANGLA_DIGITS[index] ?? digit;
  });
}

const enThousandsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/**
 * Formats an integer amount in whole BDT (taka) with thousands separators and the ৳ sign.
 * Uses Bangla digits when locale is "bn". Throws a RangeError if amount is not an integer.
 */
export function formatTaka(amount: number, locale: SupportedLocale): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError(
      `formatTaka requires an integer amount in whole taka, received: ${String(amount)}`,
    );
  }

  const isNegative = amount < 0;
  const absFormatted = enThousandsFormatter.format(Math.abs(amount));
  const localizedDigits =
    locale === "bn" ? toBanglaDigits(absFormatted) : absFormatted;

  return isNegative ? `-৳${localizedDigits}` : `৳${localizedDigits}`;
}

/**
 * Formats a Date in the Asia/Dhaka time zone for the given locale.
 */
export function formatDate(date: Date, locale: SupportedLocale): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid Date provided to formatDate.");
  }

  const formatter = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD" : "en-BD",
    {
      timeZone: TRIP_TZ,
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  );

  const formatted = formatter.format(date);
  return locale === "bn" ? toBanglaDigits(formatted) : formatted;
}

/**
 * Formats a Date as human-friendly relative time (e.g. "৫ মিনিট আগে", "just now").
 */
export function formatRelativeTime(
  date: Date,
  locale: SupportedLocale,
  now: number = Date.now(),
): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMinutes < 1) {
    return locale === "bn" ? "এইমাত্র" : "just now";
  }
  if (diffMinutes < 60) {
    const mins =
      locale === "bn" ? toBanglaDigits(diffMinutes) : String(diffMinutes);
    return locale === "bn" ? `${mins} মিনিট আগে` : `${mins}m ago`;
  }
  if (diffHours < 24) {
    const hrs =
      locale === "bn" ? toBanglaDigits(diffHours) : String(diffHours);
    return locale === "bn" ? `${hrs} ঘণ্টা আগে` : `${hrs}h ago`;
  }
  const days =
    locale === "bn" ? toBanglaDigits(diffDays) : String(diffDays);
  return locale === "bn" ? `${days} দিন আগে` : `${days}d ago`;
}

/**
 * Formats a Date's time in the Asia/Dhaka time zone (UTC+6) for the given locale.
 */
export function formatTime(date: Date, locale: SupportedLocale): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid Date provided to formatTime.");
  }

  const formatter = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD" : "en-US",
    {
      timeZone: TRIP_TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    },
  );

  const formatted = formatter.format(date);
  return locale === "bn" ? toBanglaDigits(formatted) : formatted;
}

