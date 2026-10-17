import { describe, expect, it } from "vitest";
import { formatDate, formatTaka, formatTime, toBanglaDigits } from "@/lib/format";
import { dayKey, TRIP_TZ } from "@/lib/time";

describe("toBanglaDigits", () => {
  it("converts ASCII numbers and strings to Bangla digits", () => {
    expect(toBanglaDigits(0)).toBe("০");
    expect(toBanglaDigits(1234567890)).toBe("১২৩৪৫৬৭৮৯০");
    expect(toBanglaDigits("৳12,500")).toBe("৳১২,৫০০");
  });
});

describe("formatTaka", () => {
  it("formats 0 correctly in bn and en", () => {
    expect(formatTaka(0, "bn")).toBe("৳০");
    expect(formatTaka(0, "en")).toBe("৳0");
  });

  it("formats 999 without thousands separator", () => {
    expect(formatTaka(999, "bn")).toBe("৳৯৯৯");
    expect(formatTaka(999, "en")).toBe("৳999");
  });

  it("formats 1000 with thousands separator", () => {
    expect(formatTaka(1000, "bn")).toBe("৳১,০০০");
    expect(formatTaka(1000, "en")).toBe("৳1,000");
  });

  it("formats 1234567 with thousands separators", () => {
    expect(formatTaka(1234567, "bn")).toBe("৳১,২৩৪,৫৬৭");
    expect(formatTaka(1234567, "en")).toBe("৳1,234,567");
  });

  it("formats negative integer amounts cleanly", () => {
    expect(formatTaka(-2500, "bn")).toBe("-৳২,৫০০");
    expect(formatTaka(-2500, "en")).toBe("-৳2,500");
  });

  it("throws on non-integer amounts", () => {
    expect(() => formatTaka(12.5, "bn")).toThrow(RangeError);
    expect(() => formatTaka(0.01, "en")).toThrow(RangeError);
    expect(() => formatTaka(Number.NaN, "bn")).toThrow(RangeError);
    expect(() => formatTaka(Number.POSITIVE_INFINITY, "en")).toThrow(
      RangeError,
    );
  });
});

describe("time utilities (TRIP_TZ and dayKey)", () => {
  it("exports Asia/Dhaka as TRIP_TZ", () => {
    expect(TRIP_TZ).toBe("Asia/Dhaka");
  });

  it("returns the Dhaka date for a timestamp at 23:30 Dhaka time", () => {
    // 23:30 in Dhaka (UTC+6) on 2026-10-16 is 17:30 UTC on 2026-10-16
    const dhakaLateNight = new Date("2026-10-16T23:30:00+06:00");
    expect(dayKey(dhakaLateNight)).toBe("2026-10-16");
  });

  it("proves dayKey uses Asia/Dhaka and not UTC when Dhaka and UTC are on different calendar days", () => {
    // 23:30 UTC on 2026-10-16 is 05:30 Dhaka time on 2026-10-17
    const utcLateNight = new Date("2026-10-16T23:30:00.000Z");
    expect(utcLateNight.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(dayKey(utcLateNight)).toBe("2026-10-17");

    // 00:30 Dhaka time on 2026-10-17 is 18:30 UTC on 2026-10-16
    const dhakaJustAfterMidnight = new Date("2026-10-17T00:30:00+06:00");
    expect(dhakaJustAfterMidnight.toISOString().slice(0, 10)).toBe(
      "2026-10-16",
    );
    expect(dayKey(dhakaJustAfterMidnight)).toBe("2026-10-17");
  });
});

describe("formatDate", () => {
  it("formats dates in the Asia/Dhaka time zone", () => {
    // 2026-10-16T20:00:00Z -> 2026-10-17T02:00:00+06:00 in Dhaka
    const timestamp = new Date("2026-10-16T20:00:00.000Z");
    const enFormatted = formatDate(timestamp, "en");
    const bnFormatted = formatDate(timestamp, "bn");

    expect(enFormatted).toContain("17");
    expect(bnFormatted).toContain("১৭");
  });
});

describe("formatTime", () => {
  it("formats time in Asia/Dhaka time zone, not UTC (6 hours ahead of UTC)", () => {
    // 08:39 UTC on 2026-10-17 is 14:39 (2:39 PM) in Asia/Dhaka (UTC+6)
    const timestamp = new Date("2026-10-17T08:39:00.000Z");
    const enFormatted = formatTime(timestamp, "en");
    const bnFormatted = formatTime(timestamp, "bn");

    expect(enFormatted).toContain("2:39");
    expect(enFormatted).toContain("PM");
    expect(bnFormatted).toContain("২:৩৯");
  });
});
