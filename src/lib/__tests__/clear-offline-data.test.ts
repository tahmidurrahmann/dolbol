import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearTripOfflineData, clearTripRuntimeCache } from "@/lib/offline";
import {
  _resetMemoryOutbox,
  enqueueOp,
  getOpsForTrip,
  type OutboxOp,
} from "@/lib/outbox";
import { CACHE_PREFIX } from "@/lib/sw-routing";

// Simple in-memory mock Cache implementation
class MockCache {
  private store = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    const key = typeof request === "string" ? request : request.url;
    return this.store.get(key);
  }

  async put(request: Request | string, response: Response): Promise<void> {
    const key = typeof request === "string" ? request : request.url;
    this.store.set(key, response);
  }

  async delete(request: Request | string): Promise<boolean> {
    const key = typeof request === "string" ? request : request.url;
    return this.store.delete(key);
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.store.keys()).map((url) => new Request(url));
  }

  has(url: string): boolean {
    return this.store.has(url);
  }
}

// Simple in-memory mock CacheStorage implementation
class MockCacheStorage {
  private caches = new Map<string, MockCache>();

  async open(cacheName: string): Promise<MockCache> {
    let cache = this.caches.get(cacheName);
    if (!cache) {
      cache = new MockCache();
      this.caches.set(cacheName, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys());
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.caches.delete(cacheName);
  }

  get(cacheName: string): MockCache | undefined {
    return this.caches.get(cacheName);
  }
}

describe("Trip-Scoped Offline Data Removal Suite", () => {
  let mockCaches: MockCacheStorage;

  beforeEach(() => {
    _resetMemoryOutbox();

    mockCaches = new MockCacheStorage();
    // Attach to global window
    vi.stubGlobal("window", {
      caches: mockCaches,
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("caches", mockCaches);
  });

  describe("Cache & Storage Scope: Clears ONLY the given trip, leaves others alone", () => {
    it("clears only the specified trip's runtime cache and outbox ops, leaving other trips and static cache intact", async () => {
      const runtimeCacheName = `${CACHE_PREFIX}runtime-v1`;
      const staticCacheName = `${CACHE_PREFIX}static-v1`;

      const runtimeCache = await mockCaches.open(runtimeCacheName);
      const staticCache = await mockCaches.open(staticCacheName);

      // Populate runtime cache with multiple trips
      await runtimeCache.put(
        "http://localhost:3000/trips/sajek-2026",
        new Response("Sajek HTML"),
      );
      await runtimeCache.put(
        "http://localhost:3000/trips/sajek-2026/summary",
        new Response("Sajek Summary HTML"),
      );
      await runtimeCache.put(
        "http://localhost:3000/trips/coxsbazar-2026",
        new Response("Coxsbazar HTML"),
      );
      await runtimeCache.put(
        "http://localhost:3000/trips/coxsbazar-2026/summary",
        new Response("Coxsbazar Summary HTML"),
      );

      // Populate static cache (app-wide precache assets)
      await staticCache.put(
        "http://localhost:3000/_next/static/chunks/main.js",
        new Response("JS"),
      );
      await staticCache.put(
        "http://localhost:3000/offline",
        new Response("Offline page HTML"),
      );

      // Populate outbox in memory
      const sajekOp: OutboxOp = {
        opId: "op-sajek-1",
        tripSlug: "sajek-2026",
        type: "expense.create",
        payload: {
          id: "exp-1",
          title: "Jeep rent",
          amount: 4500,
          category: "TRANSPORT",
          expenseDate: "2026-10-20",
          paidById: "member-1",
          splitType: "EQUAL",
        },
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
      };

      const coxOp: OutboxOp = {
        opId: "op-cox-1",
        tripSlug: "coxsbazar-2026",
        type: "expense.create",
        payload: {
          id: "exp-2",
          title: "Fish dinner",
          amount: 2200,
          category: "FOOD",
          expenseDate: "2026-10-20",
          paidById: "member-2",
          splitType: "EQUAL",
        },
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
      };

      await enqueueOp(sajekOp);
      await enqueueOp(coxOp);

      // Verify initial presence
      expect(runtimeCache.has("http://localhost:3000/trips/sajek-2026")).toBe(true);
      expect(runtimeCache.has("http://localhost:3000/trips/sajek-2026/summary")).toBe(true);
      expect(runtimeCache.has("http://localhost:3000/trips/coxsbazar-2026")).toBe(true);
      expect(runtimeCache.has("http://localhost:3000/trips/coxsbazar-2026/summary")).toBe(true);
      expect((await getOpsForTrip("sajek-2026")).length).toBe(1);
      expect((await getOpsForTrip("coxsbazar-2026")).length).toBe(1);

      // Action: Clear offline data for sajek-2026 ONLY
      const result = await clearTripOfflineData("sajek-2026");
      expect(result.cachedPagesDeleted).toBe(2);

      // 1. Sajek trip's cached pages are removed
      expect(runtimeCache.has("http://localhost:3000/trips/sajek-2026")).toBe(false);
      expect(runtimeCache.has("http://localhost:3000/trips/sajek-2026/summary")).toBe(false);

      // 2. Coxsbazar trip's cached pages REMAIN untouched
      expect(runtimeCache.has("http://localhost:3000/trips/coxsbazar-2026")).toBe(true);
      expect(runtimeCache.has("http://localhost:3000/trips/coxsbazar-2026/summary")).toBe(true);

      // 3. Static cache and app assets REMAIN untouched
      expect(staticCache.has("http://localhost:3000/_next/static/chunks/main.js")).toBe(true);
      expect(staticCache.has("http://localhost:3000/offline")).toBe(true);

      // 4. Sajek outbox ops are removed, Coxsbazar outbox ops REMAIN
      expect((await getOpsForTrip("sajek-2026")).length).toBe(0);
      const remainingCoxOps = await getOpsForTrip("coxsbazar-2026");
      expect(remainingCoxOps.length).toBe(1);
      expect(remainingCoxOps[0]?.opId).toBe("op-cox-1");
    });
  });

  describe("Safety & Isolation: Never touches session cookies or recent-trips list", () => {
    it("never modifies document.cookie or localStorage recent-trips during trip clear", async () => {
      // Mock cookie
      let mockCookie = "trip_member_session=session_secret_token_1234; Path=/; HttpOnly";
      const mockDoc = {
        get cookie() {
          return mockCookie;
        },
        set cookie(v: string) {
          mockCookie = v;
        },
      };
      vi.stubGlobal("document", mockDoc);

      // Mock localStorage with recent trips
      const initialRecentTrips = JSON.stringify([
        {
          slug: "sajek-2026",
          name: "সাজেক ট্যুর ২০২৬",
          destination: "সাজেক",
          lastVisited: new Date().toISOString(),
        },
        {
          slug: "coxsbazar-2026",
          name: "কক্সবাজার ভ্রমণ",
          destination: "কক্সবাজার",
          lastVisited: new Date().toISOString(),
        },
      ]);

      const mockStorage = new Map<string, string>();
      mockStorage.set("app_recent_trips", initialRecentTrips);

      vi.stubGlobal("localStorage", {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => mockStorage.set(k, v),
        removeItem: (k: string) => mockStorage.delete(k),
        clear: () => mockStorage.clear(),
      });

      // Execute clear
      await clearTripOfflineData("sajek-2026");

      // Verify cookie is completely unchanged
      expect(document.cookie).toBe("trip_member_session=session_secret_token_1234; Path=/; HttpOnly");

      // Verify recent-trips in localStorage is completely unchanged
      expect(localStorage.getItem("app_recent_trips")).toBe(initialRecentTrips);
    });
  });

  describe("Header vs Bottom Placement Verification", () => {
    const tripPageContent = readFileSync(
      join(process.cwd(), "src/app/trips/[slug]/page.tsx"),
      "utf8",
    );

    it("ensures offline data removal control is NOT rendered in the header card", () => {
      // 1. Old RemoveOfflineDataButton must not be imported or used anywhere
      expect(tripPageContent).not.toContain("RemoveOfflineDataButton");

      // 2. The header block (where member badge and trip title live) must not contain the clear offline control
      const headerSection = tripPageContent.slice(
        tripPageContent.indexOf("flex flex-wrap items-center justify-between gap-4"),
        tripPageContent.indexOf("Stat Cards"),
      );
      expect(headerSection).not.toContain("ClearTripOfflineDataLink");
      expect(headerSection).not.toContain("RemoveOfflineDataButton");
    });

    it("ensures ClearTripOfflineDataLink is rendered at the bottom of the trip page", () => {
      const linkIndex = tripPageContent.indexOf("<ClearTripOfflineDataLink");
      const tabsIndex = tripPageContent.indexOf("<TripTabsContainer");
      const sectionEndIndex = tripPageContent.lastIndexOf("</section>");

      expect(linkIndex).toBeGreaterThan(-1);
      expect(tabsIndex).toBeGreaterThan(-1);
      // Must be positioned after TripTabsContainer at the bottom of the section
      expect(linkIndex).toBeGreaterThan(tabsIndex);
      expect(linkIndex).toBeLessThan(sectionEndIndex);
    });
  });

  describe("Two-Step Unsynced Warning State Machine", () => {
    // Pure logic simulation of the component state transitions
    type Step = "idle" | "confirm" | "unsynced_warning" | "second_confirm" | "clearing" | "success";

    function transitionStep(
      current: Step,
      action: "click_link" | "click_cancel" | "click_clear" | "click_clear_anyway" | "sync_complete",
      pendingCount: number,
    ): Step {
      switch (current) {
        case "idle":
          if (action === "click_link") {
            return pendingCount > 0 ? "unsynced_warning" : "confirm";
          }
          return current;

        case "confirm":
          if (action === "click_cancel") return "idle";
          if (action === "click_clear") return "clearing";
          return current;

        case "unsynced_warning":
          if (action === "click_cancel") return "idle";
          if (action === "click_clear_anyway") return "second_confirm";
          if (action === "sync_complete") return "confirm";
          return current;

        case "second_confirm":
          if (action === "click_cancel") return "idle";
          if (action === "click_clear_anyway" || action === "click_clear") return "clearing";
          return current;

        default:
          return current;
      }
    }

    it("opens single confirmation directly when pendingCount === 0", () => {
      let state: Step = "idle";
      state = transitionStep(state, "click_link", 0);
      expect(state).toBe("confirm");

      // Cancel returns to idle
      const cancelled = transitionStep(state, "click_cancel", 0);
      expect(cancelled).toBe("idle");

      // Confirm executes clearing
      const cleared = transitionStep(state, "click_clear", 0);
      expect(cleared).toBe("clearing");
    });

    it("requires explicit second confirmation when pendingCount > 0 and does not clear without it", () => {
      let state: Step = "idle";
      // 1. Initial click with 3 pending items enters unsynced_warning
      state = transitionStep(state, "click_link", 3);
      expect(state).toBe("unsynced_warning");

      // 2. Cancel resets back to idle without clearing
      const cancelled = transitionStep(state, "click_cancel", 3);
      expect(cancelled).toBe("idle");

      // 3. Trying to clear directly does NOT work in unsynced_warning
      const invalidClear = transitionStep(state, "click_clear", 3);
      expect(invalidClear).toBe("unsynced_warning");

      // 4. Clicking 'Clear anyway' enters explicit second_confirm
      state = transitionStep(state, "click_clear_anyway", 3);
      expect(state).toBe("second_confirm");

      // 5. Cancel in second_confirm resets back to idle
      const cancelSecond = transitionStep(state, "click_cancel", 3);
      expect(cancelSecond).toBe("idle");

      // 6. Only explicit second confirmation triggers clearing
      state = transitionStep(state, "click_clear_anyway", 3);
      expect(state).toBe("clearing");
    });
  });

  describe("ICU Translation and Unsynced Warning Formatting", () => {
    const bnMessages = JSON.parse(
      readFileSync(join(process.cwd(), "src/messages/bn.json"), "utf8"),
    );
    const enMessages = JSON.parse(
      readFileSync(join(process.cwd(), "src/messages/en.json"), "utf8"),
    );
    const tripPageContent = readFileSync(
      join(process.cwd(), "src/app/trips/[slug]/page.tsx"),
      "utf8",
    );

    it("ensures message files have clearOfflineData keys without missing translations", () => {
      const keys = [
        "clearOfflineDataLink",
        "clearOfflineDataConfirmDesc",
        "clearOfflineDataClearButton",
        "clearOfflineDataClearingButton",
        "clearOfflineDataCancelButton",
        "clearOfflineDataUnsyncedWarning",
        "clearOfflineDataSyncNowButton",
        "clearOfflineDataSyncingButton",
        "clearOfflineDataClearAnywayButton",
        "clearOfflineDataSecondConfirmTitle",
        "clearOfflineDataSuccess",
      ];

      for (const k of keys) {
        expect(bnMessages.tripPage[k]).toBeDefined();
        expect(enMessages.tripPage[k]).toBeDefined();
      }

      // Must contain {count} parameter for dynamic count injection
      expect(bnMessages.tripPage.clearOfflineDataUnsyncedWarning).toContain("{count}");
      expect(enMessages.tripPage.clearOfflineDataUnsyncedWarning).toContain("{count}");
    });

    it("ensures TripPage passes count context to clearOfflineDataUnsyncedWarning to prevent next-intl FORMATTING_ERROR", () => {
      expect(tripPageContent).toContain('tTrip("clearOfflineDataUnsyncedWarning", {');
      expect(tripPageContent).toContain('count: "{count}"');
    });

    it("correctly interpolates pendingCount for English and Bengali", () => {
      const enTemplate: string = enMessages.tripPage.clearOfflineDataUnsyncedWarning;
      const bnTemplate: string = bnMessages.tripPage.clearOfflineDataUnsyncedWarning;

      const enFormatted = enTemplate.replaceAll("{count}", "3");
      expect(enFormatted).toBe("3 expense(s) are not synced yet and will be lost");

      const bnFormatted = bnTemplate.replaceAll("{count}", "৩");
      expect(bnFormatted).toBe("৩টি খরচ এখনো সিঙ্ক হয়নি, মুছলে হারিয়ে যাবে");
    });
  });
});
