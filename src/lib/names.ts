export const BANGLA_DIGIT_CHARS = "০১২৩৪৫৬৭৮৯";

/**
 * Converts Bangla digits (০-৯) in a string to ASCII digits (0-9).
 */
export function banglaToAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => {
    const idx = BANGLA_DIGIT_CHARS.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

/**
 * Normalizes a member displayName into a canonical nameKey for per-trip uniqueness checks:
 * NFC unicode normalization, collapsed internal whitespace, trimmed, and lowercased.
 */
export function normalizeNameKey(displayName: string): string {
  return displayName
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
