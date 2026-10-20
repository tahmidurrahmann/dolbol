/**
 * Metadata sanitization helper for trip titles, destinations, and preview text.
 *
 * Rules:
 * - Strips `<script>` tags and all HTML tags
 * - Strips control characters (ASCII 0-31 and 127-159) and newlines
 * - Collapses consecutive whitespace into a single space and trims
 * - Falls back to default fallback if empty
 * - Truncates to maxGraphemes (default 40) using Intl.Segmenter, appending "…" if truncated
 */
export function sanitizeTripTitleForMeta(
  input?: string | null,
  maxGraphemes = 40,
  fallback = "",
  locale = "bn",
): string {
  if (!input || typeof input !== "string") {
    return fallback;
  }

  // 1. Strip <script>...</script> and any HTML tags
  let cleaned = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  cleaned = cleaned.replace(/<[^>]*>/g, "");

  // 2. Strip control characters and newlines
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

  // 3. Collapse multiple whitespaces and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // 4. Return fallback if empty
  if (!cleaned) {
    return fallback;
  }

  // 5. Truncate with Intl.Segmenter (not UTF-16 slice) to preserve grapheme clusters and emojis
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(cleaned), (s) => s.segment);

  if (segments.length > maxGraphemes) {
    return segments.slice(0, maxGraphemes).join("") + "…";
  }

  return cleaned;
}
