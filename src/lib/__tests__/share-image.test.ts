import { describe, expect, it, vi } from "vitest";

// Mock env and db
process.env.DATABASE_URL = "postgresql://localhost:5432/db";
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: vi.fn().mockResolvedValue({
        id: "trip-1",
        slug: "test-trip-slug",
        name: "সাজেক ট্যুর ২০২৬",
        destination: "সাজেক",
        startDate: new Date("2026-10-17T00:00:00+06:00"),
        endDate: new Date("2026-10-20T00:00:00+06:00"),
        members: [
          { id: "m1", displayName: "রহিম", emoji: "🌴", isGuest: false },
          { id: "m2", displayName: "করিম", emoji: "🎒", isGuest: false },
        ],
        options: [{ id: "opt1", name: "সাজেক" }],
        votes: [{ id: "v1", optionId: "opt1" }],
        itinerary: [
          { id: "it1", dayNumber: 1, title: "রিসোর্টে ওঠা", position: 1 },
        ],
      }),
    },
  },
}));

import { GET } from "@/app/api/trips/[slug]/share-image/route";

describe("share-image route test", () => {
  it("renders image or returns expected response", async () => {
    const req = new Request("http://localhost:3000/api/trips/test-trip-slug/share-image");
    const res = await GET(req, { params: Promise.resolve({ slug: "test-trip-slug" }) });
    console.log("Response status:", res.status);
    console.log("Response headers:", Object.fromEntries(res.headers.entries()));
    const buf = await res.arrayBuffer();
    console.log("Image buffer length:", buf.byteLength);
    expect(res.status).toBe(200);
    expect(buf.byteLength).toBeGreaterThan(0);

    // Test download mode
    const downloadReq = new Request("http://localhost:3000/api/trips/test-trip-slug/share-image?download=1");
    const downloadRes = await GET(downloadReq, { params: Promise.resolve({ slug: "test-trip-slug" }) });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-disposition")).toContain("attachment;");
    const downloadBuf = await downloadRes.arrayBuffer();
    expect(downloadBuf.byteLength).toBeGreaterThan(0);
  });

  it("handles trip without destination or itinerary", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
      id: "trip-minimal",
      slug: "minimal-trip",
      name: "Minimal Trip",
      destination: null,
      startDate: null,
      endDate: null,
      members: [],
      options: [],
      votes: [],
      itinerary: [],
    } as unknown as Awaited<ReturnType<typeof db.trip.findUnique>>);

    const req = new Request("http://localhost:3000/api/trips/minimal-trip/share-image");
    const res = await GET(req, { params: Promise.resolve({ slug: "minimal-trip" }) });
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});

