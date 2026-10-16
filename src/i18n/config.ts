import type { SupportedLocale } from "@/lib/format";

export const LOCALE_COOKIE_NAME = "trip_hub_locale";
export const DEFAULT_LOCALE: SupportedLocale = "bn";
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["bn", "en"];

export function isSupportedLocale(
  value: string | undefined,
): value is SupportedLocale {
  return value === "bn" || value === "en";
}
