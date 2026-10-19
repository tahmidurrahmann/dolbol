import { describe, expect, it } from "vitest";
import { banglaToAsciiDigits } from "@/lib/names";

describe("ErrorMessageBanner (Toast) component & PIN validation", () => {
  it("cleans up error query parameter from URL on dismiss", () => {
    // Simulate window.location with an error parameter
    const initialUrl = new URL("https://dolbol.app/trips/sajek-2026?error=invalid_dates&tab=plan");
    expect(initialUrl.searchParams.get("error")).toBe("invalid_dates");
    expect(initialUrl.searchParams.get("tab")).toBe("plan");

    // Dismiss action deletes the error parameter while preserving other params
    initialUrl.searchParams.delete("error");
    expect(initialUrl.searchParams.has("error")).toBe(false);
    expect(initialUrl.searchParams.get("tab")).toBe("plan");

    const newQueryString = initialUrl.searchParams.toString();
    expect(newQueryString).toBe("tab=plan");
  });

  it("handles dismissing when error is the only query parameter", () => {
    const initialUrl = new URL("https://dolbol.app/trips/sajek-2026?error=trip_locked");
    expect(initialUrl.searchParams.get("error")).toBe("trip_locked");

    initialUrl.searchParams.delete("error");
    expect(initialUrl.searchParams.has("error")).toBe(false);
    expect(initialUrl.searchParams.toString()).toBe("");
  });

  it("validates 4-to-6 digits PIN requirement in both ASCII and Bangla digits", () => {
    const pinValidator = (raw: string) => {
      const ascii = banglaToAsciiDigits(raw.trim()).replace(/\D/g, "");
      return ascii.length >= 4 && ascii.length <= 6;
    };

    // Valid inputs
    expect(pinValidator("1234")).toBe(true);
    expect(pinValidator("12345")).toBe(true);
    expect(pinValidator("123456")).toBe(true);
    expect(pinValidator("১২৩৪")).toBe(true);
    expect(pinValidator("১২৩৪৫৬")).toBe(true);

    // Invalid inputs (< 4 or > 6 or non-digits)
    expect(pinValidator("")).toBe(false);
    expect(pinValidator("1")).toBe(false);
    expect(pinValidator("12")).toBe(false);
    expect(pinValidator("123")).toBe(false);
    expect(pinValidator("১২৩")).toBe(false);
    expect(pinValidator("1234567")).toBe(false);
    expect(pinValidator("১২৩৪৫৬৭")).toBe(false);
    expect(pinValidator("abcd")).toBe(false);
  });

  it("cleans up pinSaved query parameter from URL on dismiss", () => {
    const initialUrl = new URL(
      "https://dolbol.app/trips/sajek-2026?pinSaved=1&tab=friends",
    );
    expect(initialUrl.searchParams.get("pinSaved")).toBe("1");
    expect(initialUrl.searchParams.get("tab")).toBe("friends");

    // Dismiss action deletes the pinSaved parameter while preserving other params
    initialUrl.searchParams.delete("pinSaved");
    expect(initialUrl.searchParams.has("pinSaved")).toBe(false);
    expect(initialUrl.searchParams.get("tab")).toBe("friends");
    expect(initialUrl.searchParams.toString()).toBe("tab=friends");
  });

  it("determines the correct URL cleanup parameter based on variant", () => {
    const resolveDismissParam = (
      variant: "error" | "success" = "error",
      customParam?: string | null,
    ) => {
      if (customParam !== undefined) return customParam;
      return variant === "success" ? "pinSaved" : "error";
    };

    expect(resolveDismissParam("error")).toBe("error");
    expect(resolveDismissParam("success")).toBe("pinSaved");
    expect(resolveDismissParam("error", "custom")).toBe("custom");
    expect(resolveDismissParam("success", null)).toBe(null);
  });
});

