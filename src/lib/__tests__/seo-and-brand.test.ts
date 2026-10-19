import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock @/lib/env before any module imports it
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://postgres:test@localhost:5432/test?schema=public",
    NODE_ENV: "test",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  },
}));

// Mock next/font/google for layout.tsx import
vi.mock("next/font/google", () => ({
  Anek_Bangla: () => ({ variable: "--font-anek-bangla" }),
}));

import { generateMetadata as generateRootMetadata } from "@/app/layout";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap, { LAST_MODIFIED } from "@/app/sitemap";
import { generateMetadata as generateTripMetadata } from "@/app/trips/[slug]/page";
import { generateMetadata as generateSummaryMetadata } from "@/app/trips/[slug]/summary/page";
import { generateMetadata as generateJoinMetadata } from "@/app/trips/join/page";
import { generateMetadata as generateNewMetadata } from "@/app/trips/new/page";
import { BRAND } from "@/config/brand";
import { ACTIVE_LANDING_META, LANDING_META_OPTIONS } from "@/config/seo";
import { db } from "@/lib/db";
import { buildLandingJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { getSiteUrl } from "@/lib/site-url";
import { getLocale } from "next-intl/server";

// Mock next-intl/server so generateMetadata can execute outside a Next.js request context
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("bn"),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getMessages: vi.fn().mockResolvedValue({}),
}));

// Mock db.trip.findUnique for trip pages
vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: vi.fn(),
    },
  },
}));

describe("SEO & Indexing Control (Stage A & B)", () => {
  describe("Trip metadata robots tag", () => {
    it("ensures /trips/[slug] metadata has robots.index === false and robots.follow === false", async () => {
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "সাজেক ভ্রমণ ২০২৬",
        destination: "সাজেক",
      } as unknown as Awaited<ReturnType<typeof db.trip.findUnique>>);

      const metadata = await generateTripMetadata({
        params: Promise.resolve({ slug: "sajek-2026" }),
      });

      expect(metadata.robots).toBeDefined();
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });

      // When trip is not found
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce(null);
      const notFoundMetadata = await generateTripMetadata({
        params: Promise.resolve({ slug: "non-existent" }),
      });
      expect(notFoundMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    it("ensures public summary metadata has robots.index === false and robots.follow === false", async () => {
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce({
        name: "কক্সবাজার ট্যুর",
        destination: "কক্সবাজার",
      } as unknown as Awaited<ReturnType<typeof db.trip.findUnique>>);

      const metadata = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "cox-tour" }),
      });

      expect(metadata.robots).toBeDefined();
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });

      // When trip is not found
      vi.mocked(db.trip.findUnique).mockResolvedValueOnce(null);
      const notFoundMetadata = await generateSummaryMetadata({
        params: Promise.resolve({ slug: "non-existent" }),
      });
      expect(notFoundMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    it("ensures /trips/new metadata has robots.index === false and robots.follow === false", async () => {
      const metadata = await generateNewMetadata();
      expect(metadata.robots).toBeDefined();
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    it("ensures /trips/join metadata has robots.index === false and robots.follow === false", async () => {
      const metadata = await generateJoinMetadata();
      expect(metadata.robots).toBeDefined();
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });
  });

  describe("Robots configuration (app/robots.ts)", () => {
    it("allows '/' and disallows only '/api/' without disallowing /trips", () => {
      const config = robots();

      expect(config.rules).toBeDefined();
      const rules = Array.isArray(config.rules) ? config.rules : [config.rules];

      // Must allow root
      const hasRootAllow = rules.some((rule) => {
        const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
        return allow.includes("/");
      });
      expect(hasRootAllow).toBe(true);

      // Must disallow /api/
      const hasApiDisallow = rules.some((rule) => {
        const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
        return disallow.includes("/api/");
      });
      expect(hasApiDisallow).toBe(true);

      // Must NOT disallow /trips or /trips/ so crawlers read noindex and link previews work
      for (const rule of rules) {
        const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
        for (const path of disallow) {
          if (typeof path === "string") {
            expect(path.toLowerCase()).not.toContain("/trips");
          }
        }
      }

      // Sitemap must be an absolute URL pointing to sitemap.xml
      expect(config.sitemap).toBe(getSiteUrl("/sitemap.xml").toString());
      expect(config.sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/);
    });
  });

  describe("Sitemap configuration (app/sitemap.ts)", () => {
    it("has no /trips URL, every URL is absolute, and uses a real last-modified constant", () => {
      const entries = sitemap();

      expect(entries.length).toBeGreaterThan(0);
      expect(LAST_MODIFIED).toBeInstanceOf(Date);
      expect(Number.isNaN(LAST_MODIFIED.getTime())).toBe(false);

      for (const entry of entries) {
        // Every URL must be an absolute URL
        expect(entry.url).toMatch(/^https?:\/\//);
        const parsed = new URL(entry.url);
        expect(parsed.protocol).toMatch(/^https?:$/);

        // Never include any /trips URL in sitemap
        expect(parsed.pathname).not.toMatch(/^\/trips/);

        // Uses real last-modified date constant
        expect(entry.lastModified).toEqual(LAST_MODIFIED);
      }
    });
  });

  describe("Root Metadata & Open Graph (Stage B)", () => {
    it("builds root metadata with metadataBase, canonical, openGraph, twitter, and absolute OG URL from SITE_URL", async () => {
      // Test for Bangla locale
      vi.mocked(getLocale).mockResolvedValueOnce("bn");
      const bnMeta = await generateRootMetadata();

      expect(bnMeta.metadataBase).toEqual(getSiteUrl());
      expect(bnMeta.alternates?.canonical).toBe("/");
      expect(bnMeta.applicationName).toBe(BRAND.name.bn);
      if (bnMeta.openGraph && "type" in bnMeta.openGraph) {
        expect(bnMeta.openGraph.type).toBe("website");
      } else {
        expect.fail("Expected openGraph to have 'type'");
      }
      expect(bnMeta.openGraph?.siteName).toBe(BRAND.name.bn);
      expect(bnMeta.openGraph?.locale).toBe("bn_BD");
      expect(bnMeta.openGraph?.url).toBe(getSiteUrl("/").toString());
      expect(bnMeta.openGraph?.url).toMatch(/^https?:\/\//);
      if (bnMeta.twitter && "card" in bnMeta.twitter) {
        expect(bnMeta.twitter.card).toBe("summary_large_image");
      } else {
        expect.fail("Expected twitter to have 'card'");
      }

      // Verify title consistency across title, og:title, twitter:title
      expect(bnMeta.openGraph?.title).toBe(ACTIVE_LANDING_META.bn.title);
      expect(bnMeta.twitter?.title).toBe(ACTIVE_LANDING_META.bn.title);

      // Test for English locale
      vi.mocked(getLocale).mockResolvedValueOnce("en");
      const enMeta = await generateRootMetadata();

      expect(enMeta.applicationName).toBe(BRAND.name.en);
      expect(enMeta.openGraph?.siteName).toBe(BRAND.name.en);
      expect(enMeta.openGraph?.locale).toBe("en_US");
      expect(enMeta.openGraph?.url).toBe(getSiteUrl("/").toString());
      expect(enMeta.openGraph?.title).toBe(ACTIVE_LANDING_META.en.title);
      expect(enMeta.twitter?.title).toBe(ACTIVE_LANDING_META.en.title);
    });
  });

  describe("Web App Manifest (app/manifest.ts)", () => {
    it("is valid and has all required fields matching BRAND", () => {
      const m = manifest();

      expect(m.name).toContain(BRAND.name.bn);
      expect(m.short_name).toBe(BRAND.name.bn);
      expect(m.description).toBe(BRAND.tagline.bn);
      expect(m.start_url).toBe("/");
      expect(m.display).toBe("standalone");
      expect(m.lang).toBe("bn");
      expect(m.background_color).toBe("#ffffff");
      expect(m.theme_color).toBe(BRAND.themeColor);

      expect(Array.isArray(m.icons)).toBe(true);
      expect(m.icons?.length).toBeGreaterThanOrEqual(4);

      for (const icon of m.icons ?? []) {
        expect(icon.src).toMatch(/^\//);
        expect(icon.sizes).toBeDefined();
        expect(icon.type).toMatch(/^image\//);
      }
    });
  });

  describe("Landing JSON-LD Schema", () => {
    it("parses valid JSON-LD with no '<' and no rating or review keys", () => {
      for (const locale of ["bn", "en"] as const) {
        const jsonLd = buildLandingJsonLd(locale);
        const serialized = serializeJsonLd(jsonLd);

        // 1. Must not contain literal '<'
        expect(serialized).not.toContain("<");

        // 2. Must parse back into an object without throwing
        const parsed = JSON.parse(serialized);
        expect(parsed["@context"]).toBe("https://schema.org");
        expect(Array.isArray(parsed["@graph"])).toBe(true);

        const types = parsed["@graph"].map((node: { "@type": string }) => node["@type"]);
        expect(types).toContain("WebSite");
        expect(types).toContain("WebApplication");

        // 3. WebApplication structure
        const webApp = parsed["@graph"].find(
          (node: { "@type": string }) => node["@type"] === "WebApplication",
        );
        expect(webApp.applicationCategory).toBe("TravelApplication");
        expect(webApp.operatingSystem).toBe("Any");
        expect(webApp.inLanguage).toBe(locale === "bn" ? "bn-BD" : "en-US");
        expect(webApp.offers).toBeUndefined(); // offers omitted until confirmed

        // 4. Verify no rating, review, or aggregateRating keys exist
        const forbiddenKeys = new Set([
          "rating",
          "aggregaterating",
          "review",
          "reviews",
          "ratingvalue",
          "reviewcount",
        ]);

        function assertNoReviewOrRating(obj: unknown): void {
          if (!obj || typeof obj !== "object") return;
          for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();
            expect(forbiddenKeys.has(lowerKey)).toBe(false);
            assertNoReviewOrRating(value);
          }
        }

        assertNoReviewOrRating(parsed);
      }
    });
  });

  describe("Landing Titles and Descriptions Grapheme Limits", () => {
    const countGraphemes = (str: string, locale: "bn" | "en") =>
      [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(str)].length;

    it("ensures all landing title options stay under 60 graphemes (under 50 for Bangla)", () => {
      const options = [LANDING_META_OPTIONS.option1, LANDING_META_OPTIONS.option2];

      for (const opt of options) {
        const bnTitleGraphemes = countGraphemes(opt.bn.title, "bn");
        expect(bnTitleGraphemes).toBeLessThanOrEqual(50);
        expect(bnTitleGraphemes).toBeLessThanOrEqual(60);

        const enTitleGraphemes = countGraphemes(opt.en.title, "en");
        expect(enTitleGraphemes).toBeLessThanOrEqual(60);
      }
    });

    it("ensures all landing description options stay under 155 graphemes", () => {
      const options = [LANDING_META_OPTIONS.option1, LANDING_META_OPTIONS.option2];

      for (const opt of options) {
        const bnDescGraphemes = countGraphemes(opt.bn.description, "bn");
        expect(bnDescGraphemes).toBeLessThanOrEqual(155);

        const enDescGraphemes = countGraphemes(opt.en.description, "en");
        expect(enDescGraphemes).toBeLessThanOrEqual(155);
      }
    });
  });
});

describe("Rendered Text & Brand Integrity", () => {
  const rootDir = process.cwd();
  const srcDir = join(rootDir, "src");

  // Helper to recursively collect all files in a directory
  function getAllFiles(dir: string): string[] {
    const results: string[] = [];
    const list = readdirSync(dir);
    for (const item of list) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...getAllFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }

  it("verifies no file under src/ or messages/ contains 'OWNER MUST FILL' or 'TODO(owner)' in rendered UI text", () => {
    const allFiles = getAllFiles(srcDir);
    const forbiddenPhrases = ["OWNER MUST FILL", "TODO(owner)"];

    for (const filePath of allFiles) {
      // Exclude test file itself from detecting its own assertion strings
      if (filePath.includes("seo-and-brand.test.ts")) continue;

      const content = readFileSync(filePath, "utf-8");
      // Strip block comments and line comments so we only inspect rendered UI text
      const codeWithoutComments = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      for (const phrase of forbiddenPhrases) {
        expect(
          codeWithoutComments.includes(phrase),
          `Rendered UI text in "${filePath}" unexpectedly contains "${phrase}"`,
        ).toBe(false);
      }
    }
  });

  it("brand test: fails if 'Dolbol' or 'দলবল' appears hardcoded in src/ outside src/config/brand.ts and messages/, and fails if 'Trip Hub' or 'ট্রিপ হাব' appears anywhere outside brand.ts previousNames", () => {
    const allFiles = getAllFiles(srcDir);

    for (const filePath of allFiles) {
      const normalizedPath = filePath.replace(/\\/g, "/");

      // 1. Exclude test files: files within __tests__ or matching .test. / .spec.
      if (
        normalizedPath.includes("/__tests__/") ||
        /\.(test|spec)\.[jt]sx?$/.test(normalizedPath)
      ) {
        continue;
      }

      // 2. Read file content
      const rawContent = readFileSync(filePath, "utf-8");

      // 3. Exclude comments from code files:
      // Strip block comments (/* ... */) and line comments (// ...)
      const codeWithoutComments = rawContent
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      const isBrandConfig = normalizedPath.endsWith("src/config/brand.ts");
      const isSeoConfig = normalizedPath.endsWith("src/config/seo.ts");
      const isMessageFile = normalizedPath.includes("/messages/");

      // Check for "Dolbol" and "দলবল": allowed only in src/config/brand.ts, src/config/seo.ts, and messages/
      if (!isBrandConfig && !isSeoConfig && !isMessageFile) {
        const hasDolbol = codeWithoutComments.includes("Dolbol");
        const hasDolbolBn = codeWithoutComments.includes("দলবল");

        expect(
          hasDolbol,
          `Hardcoded "Dolbol" found outside brand.ts, seo.ts, and messages in: ${normalizedPath}`,
        ).toBe(false);

        expect(
          hasDolbolBn,
          `Hardcoded "দলবল" found outside brand.ts, seo.ts, and messages in: ${normalizedPath}`,
        ).toBe(false);
      }

      // Check for "Trip Hub" and "ট্রিপ হাব": allowed ONLY in brand.ts previousNames
      if (!isBrandConfig) {
        const hasTripHub = codeWithoutComments.includes("Trip Hub");
        const hasTripHubBn = codeWithoutComments.includes("ট্রিপ হাব");

        expect(
          hasTripHub,
          `Legacy "Trip Hub" found in: ${normalizedPath}`,
        ).toBe(false);

        expect(
          hasTripHubBn,
          `Legacy "ট্রিপ হাব" found in: ${normalizedPath}`,
        ).toBe(false);
      } else {
        // In brand.ts, verify previousNames contains them
        expect(BRAND.previousNames).toContain("Trip Hub");
        expect(BRAND.previousNames).toContain("ট্রিপ হাব");
      }
    }
  });

  describe("Stage C: Landing Page Semantics, FAQ, and Performance", () => {
    const pageContent = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf-8");
    const layoutContent = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf-8");
    const headerContent = readFileSync(join(process.cwd(), "src/components/Header.tsx"), "utf-8");
    const headerNavContent = readFileSync(join(process.cwd(), "src/components/HeaderNav.tsx"), "utf-8");

    it("has landmark regions: header, nav, main, footer", () => {
      expect(headerContent).toContain("<header");
      expect(headerNavContent).toContain("<nav");
      expect(headerNavContent).toContain('aria-label="Main Navigation"');
      expect(layoutContent).toContain('<main id="main"');
      expect(layoutContent).toContain("<footer");
    });

    it("has exactly one <h1> and logical heading order in page.tsx", () => {
      const h1Matches = pageContent.match(/<h1[\s>]/g) || [];
      expect(h1Matches.length).toBe(1);

      // Verify h1 appears before any h2 in page.tsx
      const firstH1Index = pageContent.indexOf("<h1");
      const firstH2Index = pageContent.indexOf("<h2");
      expect(firstH1Index).toBeGreaterThan(-1);
      expect(firstH2Index).toBeGreaterThan(-1);
      expect(firstH1Index).toBeLessThan(firstH2Index);
    });

    it("includes a short 'কীভাবে কাজ করে' 3-step section with confirmed facts", () => {
      expect(pageContent).toContain("কীভাবে কাজ করে");
      expect(pageContent).toContain("How it works");
      // 3 steps
      expect(pageContent).toContain('num: bn ? "১" : "1"');
      expect(pageContent).toContain('num: bn ? "২" : "2"');
      expect(pageContent).toContain('num: bn ? "৩" : "3"');
      // Confirmed facts in steps: no login, share link, whole BDT
      expect(pageContent).toContain("লগইন বা সাইন-আপ ছাড়া");
      expect(pageContent).toContain("গোপন লিংক");
      expect(pageContent).toContain("পূর্ণ টাকার");
    });

    it("includes plain HTML FAQ (<details>/<summary>) with ONLY confirmed facts", () => {
      expect(pageContent).toContain("<details");
      expect(pageContent).toContain("<summary");

      // Confirmed facts must be present:
      // 1. No login needed
      expect(pageContent).toContain("কোনো ইমেইল, পাসওয়ার্ড বা লগইন লাগে না");
      // 2. Join with name and link
      expect(pageContent).toContain("গোপন লিংকটি বন্ধুদের সাথে শেয়ার করুন");
      // 3. Type expenses in Bangla/English/Banglish
      expect(pageContent).toContain("বাংলা, ইংরেজি অথবা বাংলিশ");
      // 4. Balances computed in whole taka
      expect(pageContent).toContain("সব হিসাব পূর্ণ টাকায় (৳) সম্পন্ন হয়");
      // 5. No payment processing
      expect(pageContent).toContain("কোনো টাকা লেনদেন বা পেমেন্ট প্রসেসিং হয় না");

      // Unconfirmed facts must NOT be answered in the FAQ:
      expect(pageContent).not.toContain("টাকা/মাস");
      expect(pageContent).not.toContain("ফ্রি ট্রায়াল");
      expect(pageContent).not.toContain("গোপনীয়তা নীতিমালা অনুযায়ী কত দিন");
      expect(pageContent).not.toContain("OpenAI");
      expect(pageContent).not.toContain("Gemini");
      expect(pageContent).not.toContain("Anthropic");
    });

    it("lazy loads below-the-fold demo without blocking initial bundle", () => {
      expect(pageContent).toContain('import dynamic from "next/dynamic";');
      expect(pageContent).toContain("<Suspense");
      expect(pageContent).toContain("<ExpenseExplainerDemo");
    });
  });
});

