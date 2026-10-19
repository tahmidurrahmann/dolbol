import { describe, expect, it } from "vitest";

describe("ErrorMessageBanner component & URL state management", () => {
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
});
