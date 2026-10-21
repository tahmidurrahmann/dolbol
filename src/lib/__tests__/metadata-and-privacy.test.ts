import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://dolbol.app";

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://postgres:test@localhost:5432/test?schema=public",
    NODE_ENV: "test",
    NEXT_PUBLIC_SITE_URL: "https://dolbol.app",
  },
}));

vi.mock("next/font/google", () => ({
  Anek_Bangla: () => ({ variable: "--font-anek-bangla" }),
}));

import { generateMetadata as generateHomeMetadata } from "@/app/page";
import { generateMetadata as generateTripMetadata } from "@/app/trips/[slug]/page";
import { generateMetadata as generateSummaryMetadata } from "@/app/trips/[slug]/summary/page";
import { generateMetadata as generateJoinMetadata } from "@/app/trips/join/page";
import { generateMetadata as generateNewMetadata } from "@/app/trips/new/page";
import { BRAND } from "@/config/brand";
import { db } from "@/lib/db";
import { getCurrentMemberAndSessionForTrip } from "@/lib/session";
import { getSiteUrl } from "@/lib/site-url";
import { getLocale, getTranslations } from "next-intl/server";

// Load actual message files for accurate translation resolution
const bnMessages = JSON.parse(
  readFileSync(join(process.cwd(), "src/messages/bn.json"), "utf8"),
);
const enMessages = JSON.parse(
  readFileSync(join(process.cwd(), "src/messages/en.json"), "utf8"),
);

const makeMockGetTranslations = (defaultLocale: "bn" | "en") => {
  return async (
    namespaceOrOptions: string | { locale?: string; namespace: string },
  ) => {
    const ns =
      typeof namespaceOrOptions === "string"
        ? namespaceOrOptions
        : namespaceOrOptions.namespace;
    const loc =
      typeof namespaceOrOptions === "object" && namespaceOrOptions.locale
        ? (namespaceOrOptions.locale as "bn" | "en")
        : defaultLocale;
    const msgs = loc === "bn" ? bnMessages : enMessages;
    const nsObj = msgs[ns] || {};
    return (key: string, params?: Record<string, string | number>) => {
      let str = nsObj[key] ?? `${ns}.${key}`;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    };
  };
};

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("bn"),
  getTranslations: vi.fn(),
  getMessages: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/session", () => ({
  getCurrentMemberAndSessionForTrip: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: vi.fn(),
    },
  },
}));

const countGraphemes = (str: string, locale = "bn") =>
  [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(str)].length;

const getFirstOgImage = (images: unknown) => {
  if (Array.isArray(images) && images.length > 0) {
    return images[0] as
      | { url: string | URL; width?: number; height?: number; alt?: string; type?: string }
      | string;
  }
  return images as
    | { url: string | URL; width?: number; height?: number; alt?: string; type?: string }
    | string
    | undefined;
};

describe("Metadata, Privacy, and Social Preview Suite", () => {
  describe("OG Image File Validation", () => {
    it("verifies public/og/og-home-v1.png exists, is exactly 1200x630, and is < 300 KB", () => {
      const homePath = join(process.cwd(), "public/og/og-home-v1.png");
      const stat = statSync(homePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeLessThan(300 * 1024); // < 300 KB

      const buffer = readFileSync(homePath);
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });

    it("verifies public/og/og-invite-v1.png exists, is exactly 1200x630, and is < 300 KB", () => {
      const invitePath = join(process.cwd(), "public/og/og-invite-v1.png");
      const stat = statSync(invitePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeLessThan(300 * 1024); // < 300 KB

      const buffer = readFileSync(invitePath);
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });

    it("verifies public/og/og-invite-v2.png exists, is exactly 1200x630, and is < 300 KB", () => {
      const invitePath = join(process.cwd(), "public/og/og-invite-v2.png");
      const stat = statSync(invitePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeLessThan(300 * 1024); // < 300 KB

      const buffer = readFileSync(invitePath);
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });

    it("verifies public/og/og-invite-v3.png exists, is exactly 1200x630, and is < 300 KB", () => {
      const invitePath = join(process.cwd(), "public/og/og-invite-v3.png");
      const stat = statSync(invitePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeLessThan(300 * 1024); // < 300 KB

      const buffer = readFileSync(invitePath);
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });
  });

  describe("Privacy Rule: Zero Leakage of Member Names, Amounts, or Costs", () => {
    it("ensures trip queries reuse the shared data loader via getTripData", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "trip-sajek",
        name: "সাজেক ট্যুর ২০২৬",
        destination: "সাজেক ভ্যালি",
      } as any);

      await generateTripMetadata({
        params: Promise.resolve({ slug: "sajek-2026" }),
      });

      expect(db.trip.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "sajek-2026" },
        }),
      );
    });

    it("guarantees trip metadata NEVER contains member names, expense amounts, totals, or ৳ symbols for both member and non-member variants", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      const privateMemberNames = ["Rahim", "Karim", "Sumi", "তনু", "তানভীর", "আকাশ"];
      const privateExpenseNumbers = ["500", "750", "1500", "25000", "50000", "9999"];
      const currencyIndicators = ["৳", "BDT", "টাকা", "taka"];

      // Variant 1: Non-member (no member session)
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "trip-bandarban",
        name: "বান্দরবান অভিযান",
        destination: "বান্দরবান",
      } as any);

      const nonMemberMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "bandarban" }),
      });

      const serializedNonMember = JSON.stringify(nonMemberMeta);
      for (const name of privateMemberNames) {
        expect(serializedNonMember).not.toContain(name);
      }
      for (const num of privateExpenseNumbers) {
        expect(serializedNonMember).not.toContain(num);
      }
      for (const cur of currencyIndicators) {
        expect(serializedNonMember).not.toContain(cur);
      }

      // Variant 2: Member (active session)
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce({
        member: { id: "m1", displayName: "Rahim", tripId: "trip-bandarban" } as any,
        session: { id: "s1" } as any,
      });
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "trip-bandarban",
        name: "বান্দরবান অভিযান",
        destination: "বান্দরবান",
      } as any);

      const memberMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "bandarban" }),
      });

      const serializedMember = JSON.stringify(memberMeta);
      for (const name of privateMemberNames) {
        expect(serializedMember).not.toContain(name);
      }
      for (const num of privateExpenseNumbers) {
        expect(serializedMember).not.toContain(num);
      }
      for (const cur of currencyIndicators) {
        expect(serializedMember).not.toContain(cur);
      }
    });

    it("guarantees public summary metadata NEVER leaks private expenses or member names", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "কক্সবাজার সমুদ্র ভ্রমণ",
        destination: "কক্সবাজার",
      } as any);

      const summaryMeta = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "coxsbazar" }),
      });

      const serialized = JSON.stringify(summaryMeta);
      expect(serialized).not.toContain("৳");
      expect(serialized).not.toContain("BDT");
      expect(serialized).not.toContain("খরচ:");
      expect(serialized).not.toContain("মোট:");
    });
  });

  describe("Grapheme Limits for SEO and Social Previews", () => {
    it("ensures homepage title is <= 50 graphemes and description is <= 155 graphemes in both locales", async () => {
      for (const loc of ["bn", "en"] as const) {
        vi.mocked(getLocale).mockResolvedValue(loc);
        vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations(loc) as any);

        const meta = await generateHomeMetadata();
        const titleStr = typeof meta.title === "object" && meta.title && "absolute" in meta.title
          ? String(meta.title.absolute)
          : String(meta.title);

        expect(countGraphemes(titleStr, loc)).toBeLessThanOrEqual(50);
        expect(countGraphemes(String(meta.description), loc)).toBeLessThanOrEqual(155);
      }
    });

    it("ensures /trips/new title is <= 50 graphemes and description is <= 155 graphemes", async () => {
      for (const loc of ["bn", "en"] as const) {
        vi.mocked(getLocale).mockResolvedValue(loc);
        vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations(loc) as any);

        const meta = await generateNewMetadata();
        const titleStr = typeof meta.title === "object" && meta.title && "absolute" in meta.title
          ? String(meta.title.absolute)
          : String(meta.title);

        expect(countGraphemes(titleStr, loc)).toBeLessThanOrEqual(50);
        expect(countGraphemes(String(meta.description), loc)).toBeLessThanOrEqual(155);
      }
    });

    it("ensures /trips/join title is <= 50 graphemes and description is <= 155 graphemes", async () => {
      for (const loc of ["bn", "en"] as const) {
        vi.mocked(getLocale).mockResolvedValue(loc);
        vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations(loc) as any);

        const meta = await generateJoinMetadata();
        const titleStr = typeof meta.title === "object" && meta.title && "absolute" in meta.title
          ? String(meta.title.absolute)
          : String(meta.title);

        expect(countGraphemes(titleStr, loc)).toBeLessThanOrEqual(50);
        expect(countGraphemes(String(meta.description), loc)).toBeLessThanOrEqual(155);
      }
    });

    it("ensures /trips/[slug] description with destination is <= 155 graphemes", async () => {
      for (const loc of ["bn", "en"] as const) {
        vi.mocked(getLocale).mockResolvedValue(loc);
        vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations(loc) as any);

        vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
          name: loc === "bn" ? "সেন্টমার্টিন ২০২৬" : "Saint Martin 2026",
          destination: loc === "bn" ? "সেন্টমার্টিন দ্বীপ" : "Saint Martin Island",
        } as any);

        const meta = await generateTripMetadata({
          params: Promise.resolve({ slug: "saint-martin-2026" }),
        });

        expect(countGraphemes(String(meta.description), loc)).toBeLessThanOrEqual(155);
      }
    });

    it("ensures /trips/[slug]/summary description is <= 155 graphemes", async () => {
      for (const loc of ["bn", "en"] as const) {
        vi.mocked(getLocale).mockResolvedValue(loc);
        vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations(loc) as any);

        vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
          name: loc === "bn" ? "সুন্দরবন ট্যুর" : "Sundarban Tour",
          destination: loc === "bn" ? "সুন্দরবন" : "Sundarban",
        } as any);

        const meta = await generateSummaryMetadata({
          params: Promise.resolve({ slug: "sundarban-tour" }),
        });

        expect(countGraphemes(String(meta.description), loc)).toBeLessThanOrEqual(155);
      }
    });
  });

  describe("Absolute Image URLs and Image Assignments across all routes", () => {
    it("assigns og-home-v1.png to homepage (/)", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      const meta = await generateHomeMetadata();
      const img = getFirstOgImage(meta.openGraph?.images);
      expect(img).toBeDefined();
      const expectedUrl = getSiteUrl("/og/og-home-v1.png").toString();
      const actualUrl = typeof img === "object" ? String(img?.url) : String(img);
      expect(actualUrl).toBe(expectedUrl);
      expect(expectedUrl).toMatch(/^https?:\/\/.+\/og\/og-home-v1\.png$/);
      if (typeof img === "object" && img) {
        expect(img.width).toBe(1200);
        expect(img.height).toBe(630);
      }
    });

    it("assigns og-home-v1.png to /trips/new", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      const meta = await generateNewMetadata();
      const img = getFirstOgImage(meta.openGraph?.images);
      expect(img).toBeDefined();
      const expectedUrl = getSiteUrl("/og/og-home-v1.png").toString();
      const actualUrl = typeof img === "object" ? String(img?.url) : String(img);
      expect(actualUrl).toBe(expectedUrl);
    });

    it("assigns og-invite-v2.png to /trips/join", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      const meta = await generateJoinMetadata();
      const img = getFirstOgImage(meta.openGraph?.images);
      expect(img).toBeDefined();
      const expectedUrl = getSiteUrl("/og/og-invite-v2.png").toString();
      const actualUrl = typeof img === "object" ? String(img?.url) : String(img);
      expect(actualUrl).toBe(expectedUrl);
    });

    it("assigns og-invite-v2.png to /trips/[slug]", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "কুয়াকাটা ট্রিপ",
        destination: "কুয়াকাটা",
      } as any);

      const meta = await generateTripMetadata({
        params: Promise.resolve({ slug: "kuakata" }),
      });
      const img = getFirstOgImage(meta.openGraph?.images);
      expect(img).toBeDefined();
      const expectedUrl = getSiteUrl("/og/og-invite-v2.png").toString();
      const actualUrl = typeof img === "object" ? String(img?.url) : String(img);
      expect(actualUrl).toBe(expectedUrl);
    });

    it("assigns og-home-v1.png to /trips/[slug]/summary", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "সিলেট ট্যুর",
        destination: "জাফলং",
      } as any);

      const meta = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "sylhet" }),
      });
      const img = getFirstOgImage(meta.openGraph?.images);
      expect(img).toBeDefined();
      const expectedUrl = getSiteUrl("/og/og-home-v1.png").toString();
      const actualUrl = typeof img === "object" ? String(img?.url) : String(img);
      expect(actualUrl).toBe(expectedUrl);
    });
  });

  describe("Robots indexing controls on trip pages", () => {
    it("strictly disables search engine indexing and following on all trip pages", async () => {
      vi.mocked(db.trip.findUnique).mockResolvedValue({
        name: "লকড ট্রিপ",
        destination: null,
      } as any);

      const newMeta = await generateNewMetadata();
      const joinMeta = await generateJoinMetadata();
      const tripMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "any" }),
      });
      const summaryMeta = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "any" }),
      });

      expect(newMeta.robots).toEqual({ index: false, follow: false });
      expect(joinMeta.robots).toEqual({ index: false, follow: false });
      expect(tripMeta.robots).toEqual({ index: false, follow: false });
      expect(summaryMeta.robots).toEqual({ index: false, follow: false });
    });
  });

  describe("Scraper Compatibility (facebookexternalhit & WhatsApp)", () => {
    it("ensures openGraph and twitter tags exist and conform to social preview requirements", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "বান্দরবান ভ্রমণ ২০২৬",
        destination: "বান্দরবান",
      } as any);

      const meta = await generateTripMetadata({
        params: Promise.resolve({ slug: "bandarban-2026" }),
      });

      // 1. OpenGraph properties required by Facebook External Hit
      expect(meta.openGraph).toBeDefined();
      if (meta.openGraph && "type" in meta.openGraph) {
        expect(meta.openGraph.type).toBe("website");
      }
      if (meta.openGraph && "siteName" in meta.openGraph) {
        expect(meta.openGraph.siteName).toBe(BRAND.name.bn);
      }
      expect(meta.openGraph?.title).toContain("বান্দরবান ভ্রমণ ২০২৬ ট্রিপে যোগ দিন");
      expect(meta.openGraph?.title).toContain(BRAND.name.bn);
      expect(meta.openGraph?.description).toContain("বান্দরবান ট্রিপে আপনাকে ডাকা হয়েছে।");
      expect(meta.openGraph?.description).toContain("নাম দিয়ে ঢুকে পড়ুন, লগইন লাগবে না।");

      const firstImage = getFirstOgImage(meta.openGraph?.images);
      expect(firstImage).toBeDefined();
      const imageUrl = typeof firstImage === "object" ? String(firstImage?.url) : String(firstImage);
      expect(imageUrl).toMatch(/^https?:\/\/.*\/og\/og-invite-v2\.png$/);

      // 2. Twitter Card properties required by WhatsApp / Twitter
      expect(meta.twitter).toBeDefined();
      if (meta.twitter && "card" in meta.twitter) {
        expect(meta.twitter.card).toBe("summary_large_image");
      }
      expect(meta.twitter?.title).toBe(meta.openGraph?.title);
      expect(meta.twitter?.description).toBe(meta.openGraph?.description);
      expect(meta.twitter?.images).toEqual([imageUrl]);
    });

    it("verifies absolute https URLs, dimensions, and size for all three route types", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);

      // Route type 1: Trip invite / join (/trips/[slug] and /trips/join)
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "কক্সবাজার ট্যুর",
        destination: "কক্সবাজার",
      } as any);
      const tripMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "cox-bazar" }),
      });
      const joinMeta = await generateJoinMetadata();

      for (const meta of [tripMeta, joinMeta]) {
        const ogImg = getFirstOgImage(meta.openGraph?.images);
        expect(ogImg).toBeDefined();
        const ogUrl = typeof ogImg === "object" ? String(ogImg?.url) : String(ogImg);
        expect(ogUrl).toMatch(/^https:\/\/.+\/og\/og-invite-v2\.png$/);
        if (typeof ogImg === "object") {
          expect(ogImg?.width).toBe(1200);
          expect(ogImg?.height).toBe(630);
          expect(ogImg?.alt).toBe(BRAND.name.bn);
        }
        expect(meta.twitter?.images).toEqual([ogUrl]);
      }

      // Route type 2: Trip summary (/trips/[slug]/summary)
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "কক্সবাজার ট্যুর",
        destination: "কক্সবাজার",
      } as any);
      const summaryMeta = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "cox-bazar" }),
      });
      const summaryOgImg = getFirstOgImage(summaryMeta.openGraph?.images);
      expect(summaryOgImg).toBeDefined();
      const summaryOgUrl = typeof summaryOgImg === "object" ? String(summaryOgImg?.url) : String(summaryOgImg);
      expect(summaryOgUrl).toMatch(/^https:\/\/.+\/og\/og-home-v1\.png$/);
      if (typeof summaryOgImg === "object") {
        expect(summaryOgImg?.width).toBe(1200);
        expect(summaryOgImg?.height).toBe(630);
        expect(summaryOgImg?.alt).toBe(BRAND.name.bn);
      }
      expect(summaryMeta.twitter?.images).toEqual([summaryOgUrl]);

      // Route type 3: Home / new trip (/ and /trips/new)
      const homeMeta = await generateHomeMetadata();
      const newMeta = await generateNewMetadata();
      for (const meta of [homeMeta, newMeta]) {
        const ogImg = getFirstOgImage(meta.openGraph?.images);
        expect(ogImg).toBeDefined();
        const ogUrl = typeof ogImg === "object" ? String(ogImg?.url) : String(ogImg);
        expect(ogUrl).toMatch(/^https:\/\/.+\/og\/og-home-v1\.png$/);
        if (typeof ogImg === "object") {
          expect(ogImg?.width).toBe(1200);
          expect(ogImg?.height).toBe(630);
          expect(ogImg?.alt).toBe(BRAND.name.bn);
        }
        expect(meta.twitter?.images).toEqual([ogUrl]);
      }
    });
  });

  describe("Trip Page Title and Link-Preview Scenarios", () => {
    it("ensures message files NEVER contain JS template syntax '${'", () => {
      function checkNoDollar(obj: unknown, path = ""): void {
        if (!obj || typeof obj !== "object") return;
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === "string") {
            expect(value, `Message at ${currentPath} contains '\${'`).not.toContain("${");
          } else if (typeof value === "object") {
            checkNoDollar(value, currentPath);
          }
        }
      }

      checkNoDollar(bnMessages, "bn");
      checkNoDollar(enMessages, "en");
    });

    it("replaces the {tripName} placeholder in both languages without literal template strings", async () => {
      // Bengali
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t1",
        name: "সুন্দরবন ২০২৬",
        destination: null,
      } as any);

      const metaBn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sundarban-2026" }),
      });
      const titleBn = String((metaBn.title as { absolute: string }).absolute);
      expect(titleBn).toBe("সুন্দরবন ২০২৬ ট্রিপে যোগ দিন | দলবল");
      expect(titleBn).not.toContain("{tripName}");
      expect(titleBn).not.toContain("${tripName}");

      // English
      vi.mocked(getLocale).mockResolvedValue("en");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("en") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t1",
        name: "Sundarban 2026",
        destination: null,
      } as any);

      const metaEn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sundarban-2026" }),
      });
      const titleEn = String((metaEn.title as { absolute: string }).absolute);
      expect(titleEn).toBe("Join Sundarban 2026 | Dolbol");
      expect(titleEn).not.toContain("{tripName}");
      expect(titleEn).not.toContain("${tripName}");
    });

    it("gives a member the member title '<tripName> | <BRAND.name>' in both languages", async () => {
      // Bengali member
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce({
        member: { id: "m1", displayName: "রহিম", tripId: "t1" } as any,
        session: { id: "s1" } as any,
      });
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t1",
        name: "সাজেক ট্যুর ২০২৬",
        destination: "সাজেক",
      } as any);

      const metaBn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sajek-2026" }),
      });
      const titleBn = String((metaBn.title as { absolute: string }).absolute);
      expect(titleBn).toBe("সাজেক ট্যুর ২০২৬ | দলবল");

      // English member
      vi.mocked(getLocale).mockResolvedValue("en");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("en") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce({
        member: { id: "m1", displayName: "Rahim", tripId: "t1" } as any,
        session: { id: "s1" } as any,
      });
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t1",
        name: "Sajek Tour 2026",
        destination: "Sajek",
      } as any);

      const metaEn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sajek-2026" }),
      });
      const titleEn = String((metaEn.title as { absolute: string }).absolute);
      expect(titleEn).toBe("Sajek Tour 2026 | Dolbol");
    });

    it("gives a request without a cookie the join title", async () => {
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t2",
        name: "কক্সবাজার ট্যুর",
        destination: null,
      } as any);

      const meta = await generateTripMetadata({
        params: Promise.resolve({ slug: "coxsbazar" }),
      });
      const title = String((meta.title as { absolute: string }).absolute);
      expect(title).toBe("কক্সবাজার ট্যুর ট্রিপে যোগ দিন | দলবল");
    });

    it("ensures the title language strictly follows the locale cookie", async () => {
      // 1. Locale cookie is bn -> title is in Bangla
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t3",
        name: "সিলেট ট্যুর",
        destination: null,
      } as any);

      const metaBn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sylhet" }),
      });
      expect(String((metaBn.title as { absolute: string }).absolute)).toBe(
        "সিলেট ট্যুর ট্রিপে যোগ দিন | দলবল",
      );

      // 2. Locale cookie is en -> title is in English
      vi.mocked(getLocale).mockResolvedValue("en");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("en") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t3",
        name: "Sylhet Tour",
        destination: null,
      } as any);

      const metaEn = await generateTripMetadata({
        params: Promise.resolve({ slug: "sylhet" }),
      });
      expect(String((metaEn.title as { absolute: string }).absolute)).toBe(
        "Join Sylhet Tour | Dolbol",
      );
    });

    it("falls back gracefully when trip name is empty or whitespace", async () => {
      // Non-member with empty name
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce(null);
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t-empty",
        name: "   ",
        destination: null,
      } as any);

      const nonMemberMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "empty-slug" }),
      });
      expect(String((nonMemberMeta.title as { absolute: string }).absolute)).toBe(
        "ট্রিপে যোগ দিন | দলবল",
      );

      // Member with empty name
      vi.mocked(getLocale).mockResolvedValue("bn");
      vi.mocked(getTranslations).mockImplementation(makeMockGetTranslations("bn") as any);
      vi.mocked(getCurrentMemberAndSessionForTrip).mockResolvedValueOnce({
        member: { id: "m1", displayName: "Rahim", tripId: "t-empty" } as any,
        session: { id: "s1" } as any,
      });
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        id: "t-empty",
        name: "   ",
        destination: null,
      } as any);

      const memberMeta = await generateTripMetadata({
        params: Promise.resolve({ slug: "empty-slug" }),
      });
      expect(String((memberMeta.title as { absolute: string }).absolute)).toBe(
        "ট্রিপের হিসাব | দলবল",
      );
    });
  });
});
