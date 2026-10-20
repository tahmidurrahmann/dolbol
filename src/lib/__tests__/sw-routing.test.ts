import { describe, expect, it } from "vitest";
import {
  formatLastUpdatedTime,
  getFetchStrategy,
  isCacheFromOldBuild,
  shouldCacheResponse,
} from "@/lib/sw-routing";

describe("Service Worker Routing & Cache Decision Logic", () => {
  describe("getFetchStrategy", () => {
    it("handles non-GET requests as network-only (never cached)", () => {
      const nonGetMethods = ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
      for (const method of nonGetMethods) {
        expect(
          getFetchStrategy({
            method,
            url: "https://example.com/trips/sajek/expenses",
            mode: "navigate",
          }),
        ).toBe("network-only");
      }
    });

    it("handles all /api/* requests as network-only (never cached)", () => {
      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/api/health",
        }),
      ).toBe("network-only");

      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/api/trips/sajek/parse-expense",
        }),
      ).toBe("network-only");
    });

    it("handles /_next/static/* as cache-first (content-hashed)", () => {
      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/_next/static/chunks/main-12345.js",
        }),
      ).toBe("cache-first");

      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/_next/static/css/styles-abcde.css",
        }),
      ).toBe("cache-first");
    });

    it("handles static icons and manifest as cache-first", () => {
      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/manifest.webmanifest",
        }),
      ).toBe("cache-first");

      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/favicon.ico",
        }),
      ).toBe("cache-first");

      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/icons/icon-192.png",
        }),
      ).toBe("cache-first");
    });

    it("handles page navigation requests as network-first", () => {
      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/trips/sajek-2026",
          mode: "navigate",
        }),
      ).toBe("network-first");

      expect(
        getFetchStrategy({
          method: "GET",
          url: "https://example.com/",
          mode: "navigate",
        }),
      ).toBe("network-first");
    });
  });

  describe("shouldCacheResponse", () => {
    it("returns true for status 200 without Set-Cookie", () => {
      const headers = new Map<string, string>();
      headers.set("content-type", "text/html");

      expect(
        shouldCacheResponse({
          status: 200,
          headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        }),
      ).toBe(true);
    });

    it("returns false if response has a Set-Cookie header (security rule)", () => {
      const headers = new Map<string, string>();
      headers.set("set-cookie", "session_token=abc123; Path=/; HttpOnly");

      expect(
        shouldCacheResponse({
          status: 200,
          headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        }),
      ).toBe(false);
    });

    it("returns false for non-200 responses (307 redirect, 404, 500 error)", () => {
      const headers = new Map<string, string>();

      expect(
        shouldCacheResponse({
          status: 307,
          headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        }),
      ).toBe(false);

      expect(
        shouldCacheResponse({
          status: 404,
          headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        }),
      ).toBe(false);

      expect(
        shouldCacheResponse({
          status: 500,
          headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        }),
      ).toBe(false);
    });
  });

  describe("isCacheFromOldBuild (build ID cleanup)", () => {
    const currentBuildId = "build-20261020-abc";

    it("preserves current build caches", () => {
      expect(
        isCacheFromOldBuild(`app-cache-runtime-${currentBuildId}`, currentBuildId),
      ).toBe(false);
      expect(
        isCacheFromOldBuild(`app-cache-static-${currentBuildId}`, currentBuildId),
      ).toBe(false);
    });

    it("flags caches from older builds for deletion", () => {
      expect(
        isCacheFromOldBuild("app-cache-runtime-old-build-1", currentBuildId),
      ).toBe(true);
      expect(
        isCacheFromOldBuild("app-cache-static-old-build-1", currentBuildId),
      ).toBe(true);
    });

    it("ignores foreign caches not belonging to this app", () => {
      expect(
        isCacheFromOldBuild("other-app-cache-v1", currentBuildId),
      ).toBe(false);
    });
  });

  describe("formatLastUpdatedTime", () => {
    it("formats time with AM/PM and converts to Bangla digits for bn locale", () => {
      const date = new Date(2026, 9, 20, 14, 30); // 2:30 PM
      const formattedBn = formatLastUpdatedTime(date, "bn");
      expect(formattedBn).toContain("PM");
      expect(formattedBn).toContain("২:৩০");

      const formattedEn = formatLastUpdatedTime(date, "en");
      expect(formattedEn).toBe("2:30 PM");
    });
  });
});
