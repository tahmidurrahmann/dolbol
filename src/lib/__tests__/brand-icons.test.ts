import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock next-intl/server for Header and layout imports
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("bn"),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getMessages: vi.fn().mockResolvedValue({}),
}));

import manifest from "@/app/manifest";
import { BRAND } from "@/config/brand";
import { Header } from "@/components/Header";
import { getLocale } from "next-intl/server";

describe("Brand Mark and Icon Assets", () => {
  it("ensures every icon referenced in manifest.ts exists on disk and is non-empty", () => {
    const m = manifest();
    expect(m.icons).toBeDefined();
    expect(Array.isArray(m.icons)).toBe(true);
    expect(m.icons!.length).toBeGreaterThanOrEqual(3);

    for (const icon of m.icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\//);
      const filePath = join(process.cwd(), "public", icon.src.replace(/^\//, ""));
      expect(existsSync(filePath), `Manifest icon not found on disk: ${filePath}`).toBe(true);
      const stat = statSync(filePath);
      expect(stat.size, `Manifest icon is empty: ${filePath}`).toBeGreaterThan(0);
    }

    // Verify purpose field requirements
    const maskable = m.icons!.find((i) => i.src === "/icons/icon-maskable-512.png");
    expect(maskable?.purpose).toBe("maskable");

    const any192 = m.icons!.find((i) => i.src === "/icons/icon-192.png");
    expect(any192?.purpose).toBe("any");

    const any512 = m.icons!.find((i) => i.src === "/icons/icon-512.png");
    expect(any512?.purpose).toBe("any");

    // Theme color
    expect(m.theme_color).toBe(BRAND.themeColor);
  });

  it("ensures Next.js App Router metadata icons exist on disk and are non-empty", () => {
    const appDir = join(process.cwd(), "src", "app");
    const requiredAppIcons = ["favicon.ico", "icon.svg", "apple-icon.png"];

    for (const file of requiredAppIcons) {
      const fullPath = join(appDir, file);
      expect(existsSync(fullPath), `Required App Router icon missing: ${fullPath}`).toBe(true);
      expect(statSync(fullPath).size).toBeGreaterThan(0);
    }

    const brandDir = join(process.cwd(), "public", "brand");
    const requiredBrandSvgs = ["logo.svg", "logo-mark-light.svg"];

    for (const file of requiredBrandSvgs) {
      const fullPath = join(brandDir, file);
      expect(existsSync(fullPath), `Required brand SVG missing: ${fullPath}`).toBe(true);
      expect(statSync(fullPath).size).toBeGreaterThan(0);
    }
  });

  it("ensures the Header component renders the brand logo with alt text matching BRAND.name[locale]", async () => {
    // 1. Test Bengali locale
    vi.mocked(getLocale).mockResolvedValueOnce("bn");
    const headerBn = await Header();

    // Traverse JSX tree to find Image component
    function findImages(node: unknown): Record<string, unknown>[] {
      const results: Record<string, unknown>[] = [];
      if (!node || typeof node !== "object") return results;
      const el = node as { props?: { children?: unknown; src?: string; alt?: string; width?: number; height?: number } };
      if (el.props?.src === "/brand/logo.svg") {
        results.push(el.props);
      }
      if (el.props?.children) {
        if (Array.isArray(el.props.children)) {
          for (const c of el.props.children) {
            results.push(...findImages(c));
          }
        } else {
          results.push(...findImages(el.props.children));
        }
      }
      return results;
    }

    const imagesBn = findImages(headerBn);
    expect(imagesBn.length).toBe(1);
    const imgBn = imagesBn[0];
    expect(imgBn).toBeDefined();
    expect(imgBn?.alt).toBe(BRAND.name.bn);
    expect(imgBn?.width).toBe(40);
    expect(imgBn?.height).toBe(40);

    // 2. Test English locale
    vi.mocked(getLocale).mockResolvedValueOnce("en");
    const headerEn = await Header();
    const imagesEn = findImages(headerEn);
    expect(imagesEn.length).toBe(1);
    const imgEn = imagesEn[0];
    expect(imgEn).toBeDefined();
    expect(imgEn?.alt).toBe(BRAND.name.en);
    expect(imgEn?.width).toBe(40);
    expect(imgEn?.height).toBe(40);
  });

  it("fails if the palm tree emoji '🌴' appears in any component that renders the brand mark", async () => {
    const { readFileSync } = await import("node:fs");

    // All components and routes responsible for rendering the brand mark
    const brandMarkFiles = [
      "src/components/Header.tsx",
      "src/components/RecentTripsList.tsx",
      "src/components/BackToTripBar.tsx",
      "src/app/page.tsx",
      "src/app/manifest.ts",
      "src/app/trips/[slug]/summary/page.tsx",
      "src/components/PublicSummaryShareCard.tsx",
      "src/components/ShareAndExportCard.tsx",
      "src/app/api/trips/[slug]/share-image/route.tsx",
    ];

    for (const relPath of brandMarkFiles) {
      const fullPath = join(process.cwd(), relPath);
      const content = readFileSync(fullPath, "utf-8");
      expect(
        content.includes("🌴"),
        `Brand mark file "${relPath}" unexpectedly contains old palm-tree emoji "🌴"`,
      ).toBe(false);
    }

    // Verify the two explicitly allowed decorative uses are preserved
    const tripPage = readFileSync(
      join(process.cwd(), "src/app/trips/[slug]/page.tsx"),
      "utf-8",
    );
    expect(
      tripPage.includes("🌴"),
      "Decorative trip title emoji in trips/[slug]/page.tsx should be preserved",
    ).toBe(true);

    const inviteCard = readFileSync(
      join(process.cwd(), "src/components/InviteFriendsCard.tsx"),
      "utf-8",
    );
    expect(
      inviteCard.includes("🌴"),
      "Decorative invite message emoji in InviteFriendsCard.tsx should be preserved",
    ).toBe(true);
  });
});
