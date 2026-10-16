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
