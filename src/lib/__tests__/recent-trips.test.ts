import { describe, expect, it } from "vitest";
import {
  addRecentTrip,
  clearRecentTrips,
  formatLastOpened,
  getRecentTrips,
  RECENT_TRIPS_STORAGE_KEY,
  removeRecentTrip,
} from "@/lib/recent-trips";

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
  };
}

function createFailingStorage(): Storage {
  return {
    getItem(): string | null {
      throw new Error("QuotaExceededError: localStorage getItem failed");
    },
    setItem(): void {
      throw new Error("QuotaExceededError: localStorage setItem failed");
    },
    removeItem(): void {
      throw new Error("SecurityError: localStorage removeItem failed");
    },
    clear(): void {
      throw new Error("SecurityError: localStorage clear failed");
    },
    key(): string | null {
      throw new Error("SecurityError: localStorage key failed");
    },
    get length(): number {
      throw new Error("SecurityError: localStorage length failed");
    },
  };
}

describe("recent-trips storage utility", () => {
  describe("add", () => {
    it("adds a new trip with slug, trip name, my member name, and timestamp", () => {
      const storage = createMockStorage();
      const list = addRecentTrip(
        {
          slug: "sajek-2026-xyz",
          tripName: "Sajek Tour 2026",
          myMemberName: "Rahim",
          lastOpened: 1776400000000,
        },
        storage,
      );

      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        slug: "sajek-2026-xyz",
        tripName: "Sajek Tour 2026",
        myMemberName: "Rahim",
        lastOpened: 1776400000000,
      });

      // Verify stored data in storage
      const rawStored = storage.getItem(RECENT_TRIPS_STORAGE_KEY);
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored!);
      expect(parsed).toEqual(list);
    });

    it("never stores tokens, PINs, or money data in storage", () => {
      const storage = createMockStorage();
      addRecentTrip(
        {
          slug: "coxs-bazar-2026",
          tripName: "Cox's Bazar",
          myMemberName: "Tanvir",
          lastOpened: 1776400000000,
          // extraneous fields that should not be present
          ...({ token: "secret_123", pin: "1234", amount: 5000 } as object),
        },
        storage,
      );

      const rawStored = storage.getItem(RECENT_TRIPS_STORAGE_KEY)!;
      expect(rawStored).not.toContain("secret_123");
      expect(rawStored).not.toContain("1234");
      expect(rawStored).not.toContain("5000");

      const list = getRecentTrips(storage);
      expect(list[0]).toEqual({
        slug: "coxs-bazar-2026",
        tripName: "Cox's Bazar",
        myMemberName: "Tanvir",
        lastOpened: 1776400000000,
      });
      expect(list[0]).not.toHaveProperty("token");
      expect(list[0]).not.toHaveProperty("pin");
      expect(list[0]).not.toHaveProperty("amount");
    });
  });

  describe("move-to-top", () => {
    it("moves an already stored trip to the top of the list when opened again", () => {
      const storage = createMockStorage();

      addRecentTrip(
        {
          slug: "trip-1",
          tripName: "Trip 1",
          myMemberName: "User 1",
          lastOpened: 1000,
        },
        storage,
      );
      addRecentTrip(
        {
          slug: "trip-2",
          tripName: "Trip 2",
          myMemberName: "User 2",
          lastOpened: 2000,
        },
        storage,
      );
      addRecentTrip(
        {
          slug: "trip-3",
          tripName: "Trip 3",
          myMemberName: "User 3",
          lastOpened: 3000,
        },
        storage,
      );

      let current = getRecentTrips(storage);
      expect(current.map((t) => t.slug)).toEqual([
        "trip-3",
        "trip-2",
        "trip-1",
      ]);

      // Re-open trip-1 with a newer timestamp and updated member name
      const updated = addRecentTrip(
        {
          slug: "trip-1",
          tripName: "Trip 1 Updated",
          myMemberName: "User 1 Renamed",
          lastOpened: 5000,
        },
        storage,
      );

      expect(updated.map((t) => t.slug)).toEqual([
        "trip-1",
        "trip-3",
        "trip-2",
      ]);
      expect(updated[0]).toEqual({
        slug: "trip-1",
        tripName: "Trip 1 Updated",
        myMemberName: "User 1 Renamed",
        lastOpened: 5000,
      });
    });
  });

  describe("cap at 10", () => {
    it("caps the total stored entries at 10 and drops oldest entries", () => {
      const storage = createMockStorage();

      for (let i = 1; i <= 15; i++) {
        addRecentTrip(
          {
            slug: `trip-${i}`,
            tripName: `Trip ${i}`,
            myMemberName: `User ${i}`,
            lastOpened: i * 1000,
          },
          storage,
        );
      }

      const list = getRecentTrips(storage);
      expect(list).toHaveLength(10);
      // Most recent should be trip-15 down to trip-6
      expect(list.map((t) => t.slug)).toEqual([
        "trip-15",
        "trip-14",
        "trip-13",
        "trip-12",
        "trip-11",
        "trip-10",
        "trip-9",
        "trip-8",
        "trip-7",
        "trip-6",
      ]);
      // Oldest trips (trip-1 to trip-5) were dropped
      expect(list.some((t) => t.slug === "trip-1")).toBe(false);
      expect(list.some((t) => t.slug === "trip-5")).toBe(false);
    });
  });

  describe("corrupt data ignored", () => {
    it("returns empty array when storage has non-JSON string", () => {
      const storage = createMockStorage({
        [RECENT_TRIPS_STORAGE_KEY]: "{not valid json",
      });

      expect(getRecentTrips(storage)).toEqual([]);
    });

    it("returns empty array when storage has non-array JSON", () => {
      const storage = createMockStorage({
        [RECENT_TRIPS_STORAGE_KEY]: JSON.stringify({ slug: "not-an-array" }),
      });

      expect(getRecentTrips(storage)).toEqual([]);
    });

    it("filters out corrupt items in array and retains valid items", () => {
      const storage = createMockStorage({
        [RECENT_TRIPS_STORAGE_KEY]: JSON.stringify([
          { slug: "valid-1", tripName: "Valid 1", myMemberName: "Rahim", lastOpened: 2000 },
          { badField: 123 }, // Corrupt item missing slug, tripName, etc.
          { slug: "valid-2", tripName: "Valid 2", myMemberName: "Karim", lastOpened: "not-a-number" }, // Invalid timestamp
          { slug: "valid-3", tripName: "Valid 3", myMemberName: "Tanvir", lastOpened: 3000 },
          null,
          "invalid string",
        ]),
      });

      const list = getRecentTrips(storage);
      expect(list).toHaveLength(2);
      expect(list.map((t) => t.slug)).toEqual(["valid-3", "valid-1"]);
    });

    it("does not crash when adding an invalid entry with empty slug", () => {
      const storage = createMockStorage();
      addRecentTrip(
        {
          slug: "valid-slug",
          tripName: "Valid Trip",
          myMemberName: "Rahim",
          lastOpened: 1000,
        },
        storage,
      );

      const res = addRecentTrip(
        {
          slug: "",
          tripName: "No slug",
          myMemberName: "Rahim",
        },
        storage,
      );

      expect(res).toHaveLength(1);
      expect(res[0]?.slug).toBe("valid-slug");
    });
  });

  describe("storage unavailable", () => {
    it("handles missing storage (undefined/null) gracefully", () => {
      // In node environment without window, resolveStorage returns null
      expect(getRecentTrips(undefined)).toEqual([]);
      expect(
        addRecentTrip(
          { slug: "test", tripName: "Test", myMemberName: "User" },
          undefined,
        ),
      ).toEqual([]);
      expect(removeRecentTrip("test", undefined)).toEqual([]);
      expect(() => clearRecentTrips(undefined)).not.toThrow();
    });

    it("catches errors when storage throws on getItem, setItem, removeItem", () => {
      const failingStorage = createFailingStorage();

      expect(() => getRecentTrips(failingStorage)).not.toThrow();
      expect(getRecentTrips(failingStorage)).toEqual([]);

      expect(() =>
        addRecentTrip(
          { slug: "test", tripName: "Test", myMemberName: "User" },
          failingStorage,
        ),
      ).not.toThrow();

      expect(() => removeRecentTrip("test", failingStorage)).not.toThrow();
      expect(() => clearRecentTrips(failingStorage)).not.toThrow();
    });
  });

  describe("removeRecentTrip and clearRecentTrips", () => {
    it("removes a specific trip by slug locally only", () => {
      const storage = createMockStorage();
      addRecentTrip(
        { slug: "trip-a", tripName: "Trip A", myMemberName: "Me", lastOpened: 100 },
        storage,
      );
      addRecentTrip(
        { slug: "trip-b", tripName: "Trip B", myMemberName: "Me", lastOpened: 200 },
        storage,
      );

      const afterRemove = removeRecentTrip("trip-a", storage);
      expect(afterRemove).toHaveLength(1);
      expect(afterRemove[0]?.slug).toBe("trip-b");
      expect(getRecentTrips(storage)).toEqual(afterRemove);
    });

    it("clears all stored trips", () => {
      const storage = createMockStorage();
      addRecentTrip(
        { slug: "trip-a", tripName: "Trip A", myMemberName: "Me", lastOpened: 100 },
        storage,
      );
      clearRecentTrips(storage);
      expect(getRecentTrips(storage)).toEqual([]);
    });
  });

  describe("formatLastOpened", () => {
    const NOW = 1776400000000;

    it("formats 'just now' / 'এইমাত্র' for < 1 minute", () => {
      expect(formatLastOpened(NOW - 30 * 1000, "bn", NOW)).toBe("এইমাত্র");
      expect(formatLastOpened(NOW - 30 * 1000, "en", NOW)).toBe("Just now");
    });

    it("formats minutes ago for < 60 minutes", () => {
      expect(formatLastOpened(NOW - 5 * 60 * 1000, "bn", NOW)).toBe("৫ মিনিট আগে");
      expect(formatLastOpened(NOW - 5 * 60 * 1000, "en", NOW)).toBe("5 mins ago");
      expect(formatLastOpened(NOW - 1 * 60 * 1000, "en", NOW)).toBe("1 min ago");
    });

    it("formats hours ago for < 24 hours", () => {
      expect(formatLastOpened(NOW - 3 * 3600 * 1000, "bn", NOW)).toBe("৩ ঘণ্টা আগে");
      expect(formatLastOpened(NOW - 3 * 3600 * 1000, "en", NOW)).toBe("3 hours ago");
      expect(formatLastOpened(NOW - 1 * 3600 * 1000, "en", NOW)).toBe("1 hour ago");
    });

    it("formats yesterday for 1 day ago", () => {
      expect(formatLastOpened(NOW - 25 * 3600 * 1000, "bn", NOW)).toBe("গতকাল");
      expect(formatLastOpened(NOW - 25 * 3600 * 1000, "en", NOW)).toBe("Yesterday");
    });

    it("formats days ago for 2 to 6 days ago", () => {
      expect(formatLastOpened(NOW - 3 * 24 * 3600 * 1000, "bn", NOW)).toBe("৩ দিন আগে");
      expect(formatLastOpened(NOW - 3 * 24 * 3600 * 1000, "en", NOW)).toBe("3 days ago");
    });
  });
});
