import { describe, expect, it } from "vitest";
import { sanitizeTripTitleForMeta } from "@/lib/sanitize-meta";

describe("sanitizeTripTitleForMeta helper", () => {
  it("strips control characters and newlines", () => {
    const raw = "Sajek\r\n\tTour\u0000\u001F 2026\u007F";
    const cleaned = sanitizeTripTitleForMeta(raw);
    expect(cleaned).toBe("Sajek Tour 2026");
    expect(cleaned).not.toMatch(/[\r\n\t\u0000-\u001F\u007F-\u009F]/);
  });

  it("collapses multiple consecutive whitespace characters and trims edges", () => {
    const raw = "   Bandarban    Winter    Camp   ";
    const cleaned = sanitizeTripTitleForMeta(raw);
    expect(cleaned).toBe("Bandarban Winter Camp");
  });

  it("strips <script> tags and other HTML tags", () => {
    const withScript = "<script>alert('xss')</script>Cox's Bazar Tour";
    expect(sanitizeTripTitleForMeta(withScript)).toBe("Cox's Bazar Tour");

    const withHtml = "<b>Sylhet</b> <i>Tea Garden</i> <span>Trip</span>";
    expect(sanitizeTripTitleForMeta(withHtml)).toBe("Sylhet Tea Garden Trip");

    const onlyScript = "<script>alert('only')</script>";
    expect(sanitizeTripTitleForMeta(onlyScript, 40, "Fallback")).toBe("Fallback");
  });

  it("returns fallback on null, undefined, empty, or whitespace-only strings", () => {
    expect(sanitizeTripTitleForMeta(null, 40, "Default Title")).toBe("Default Title");
    expect(sanitizeTripTitleForMeta(undefined, 40, "Default Title")).toBe("Default Title");
    expect(sanitizeTripTitleForMeta("", 40, "Default Title")).toBe("Default Title");
    expect(sanitizeTripTitleForMeta("     ", 40, "Default Title")).toBe("Default Title");
    expect(sanitizeTripTitleForMeta("\n\r\t", 40, "Default Title")).toBe("Default Title");
  });

  it("handles long Bangla names by truncating to 40 graphemes + '…'", () => {
    // 50 Bangla words/graphemes
    const longBangla = "কক্সবাজার এবং সেন্টমার্টিন দ্বীপ ভ্রমণ ২০২৬ সকল বন্ধুদের একসাথে খরচের হিসাব";
    const segmenter = new Intl.Segmenter("bn", { granularity: "grapheme" });
    const originalGraphemes = Array.from(segmenter.segment(longBangla));
    expect(originalGraphemes.length).toBeGreaterThan(40);

    const truncated = sanitizeTripTitleForMeta(longBangla, 40);
    const resultGraphemes = Array.from(segmenter.segment(truncated), (s) => s.segment);

    // Should be exactly 40 graphemes plus the '…' character (total 41)
    expect(resultGraphemes.length).toBe(41);
    expect(truncated.endsWith("…")).toBe(true);

    // Verify it doesn't break character clusters (first 40 graphemes match)
    const expectedPrefix = originalGraphemes.slice(0, 40).map((s) => s.segment).join("");
    expect(truncated).toBe(expectedPrefix + "…");
  });

  it("properly handles emojis without splitting surrogate pairs or ZWJ sequences", () => {
    // 👨‍👩‍👧‍👦 is a single grapheme cluster despite having multiple Unicode code points
    const emojiTrip = "👨‍👩‍👧‍👦 🌴 🏖️ ⛺ 🎒 🚤 🏕️ Family Vacation 2026";
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

    // Truncate at 7 graphemes
    const truncated = sanitizeTripTitleForMeta(emojiTrip, 7);
    const resultGraphemes = Array.from(segmenter.segment(truncated), (s) => s.segment);

    expect(truncated.endsWith("…")).toBe(true);
    expect(resultGraphemes.length).toBe(8); // 7 + '…'
    // Ensure 👨‍👩‍👧‍👦 is kept intact
    expect(truncated.startsWith("👨‍👩‍👧‍👦")).toBe(true);
  });

  it("preserves short names under 40 graphemes without appending '…'", () => {
    const shortName = "সাজেক ভ্রমণ ২০২৬";
    const cleaned = sanitizeTripTitleForMeta(shortName, 40);
    expect(cleaned).toBe("সাজেক ভ্রমণ ২০২৬");
    expect(cleaned.endsWith("…")).toBe(false);
  });
});
