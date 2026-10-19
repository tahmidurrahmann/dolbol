# Brand Re-naming & Technical SEO Migration Guide: "Trip Hub" to "Dolbol"

This guide outlines all steps, assets, configurations, and verification procedures required for the rebranding from **Trip Hub** (ট্রিপ হাব) to **Dolbol** (দলবল), including asset re-exports, environment setup, domain redirects, social scrapers, and search console address changes.

---

## 1. Single Source of Truth (`src/config/brand.ts`)

All brand information is consolidated in `src/config/brand.ts`:
- **Name**: `{ bn: "দলবল", en: "Dolbol" }`
- **Descriptor**: `{ bn: "ট্রিপ ও খরচ", en: "Trip & Costs" }`
- **Tagline**: `{ bn: "দলবল নিয়ে ঘুরি, হিসাব রাখি", en: "Plan the trip. Split the costs." }`
- **Previous Names**: `["Trip Hub", "ট্রিপ হাব"]`
- **Alternate Names**: `["Dolbol", "দলবল"]`
- **Theme Color**: `#0f6b4a`

No UI component hardcodes the brand name; all labels are rendered via `BRAND` or localized messages (`src/messages/bn.json` and `src/messages/en.json`). In `src/components/Header.tsx`, typography styles (`uppercase tracking-wider`) are conditionally applied **only** to English, preventing broken conjunct glyphs in Bangla script.

---

## 2. Checklist of Edited Files (Stage A)

- [x] `src/config/brand.ts` (created brand single source of truth)
- [x] `src/lib/site-url.ts` (created canonical URL resolver using `NEXT_PUBLIC_SITE_URL`)
- [x] `src/lib/env.ts` (added `NEXT_PUBLIC_SITE_URL` validation; required in production, defaults to `http://localhost:3000`)
- [x] `.env.example` & `.env` (documented `NEXT_PUBLIC_SITE_URL`)
- [x] `next.config.ts` (configured `X-Robots-Tag: noindex, nofollow` headers for `/trips/:path*` and `/api/:path*`)
- [x] `src/app/robots.ts` (allows `/`, disallows only `/api/`, specifies absolute `sitemap.xml` URL, avoids disallowing `/trips/`)
- [x] `src/app/sitemap.ts` (single-array driven index of public routes `/`, absolute URLs, static `LAST_MODIFIED` constant, excludes all `/trips/*`)
- [x] `src/app/layout.tsx` (uses `BRAND.themeColor` and dynamic localized title)
- [x] `src/components/Header.tsx` (reads brand and descriptor from `BRAND`, applies uppercase/tracking-wider only in English)
- [x] `src/app/trips/[slug]/page.tsx` (`robots: { index: false, follow: false }`, Open Graph previews keep only trip name & destination, absolute image URLs)
- [x] `src/app/trips/[slug]/summary/page.tsx` (`robots: { index: false, follow: false }`, absolute Open Graph image URL)
- [x] `src/app/trips/new/page.tsx` (`robots: { index: false, follow: false }`)
- [x] `src/app/trips/join/page.tsx` (`robots: { index: false, follow: false }`, absolute Open Graph image URL)
- [x] `src/components/InviteFriendsCard.tsx` (uses `getSiteUrl()`, eliminated hardcoded vercel domain)
- [x] `src/components/ShareAndExportCard.tsx` (uses `BRAND` and `getSiteUrl().host`)
- [x] `src/app/api/trips/[slug]/share-image/route.tsx` (uses `BRAND.name.bn` and `getSiteUrl().host`)
- [x] `src/app/api/dev/render-image/route.tsx` (calls `notFound()` when `NODE_ENV === "production"`)
- [x] `src/app/dev/expense-demo/page.tsx` & `src/app/dev/render-test/page.tsx` (call `notFound()` in production)
- [x] `src/app/error.tsx` (uses `BRAND.name.en`)
- [x] `src/messages/bn.json` & `src/messages/en.json` (updated brand, taglines, and descriptors)
- [x] `src/lib/__tests__/seo-and-brand.test.ts` (8 Vitest automated tests enforcing metadata robots, sitemap, brand integrity, and absence of placeholder strings)

---

## 3. Brand Assets & Image Re-export Checklist

Before deploying production assets, re-export the following visual assets with the new "Dolbol" identity and `#0f6b4a` emerald palette:

- [ ] **Open Graph & Twitter Banner** (`public/og-image.png`):
  - Dimensions: `1200 x 630` px (PNG format, sRGB color profile, under 300 KB).
  - Content: Dolbol logo (🌴), "দলবল / Dolbol", tagline "Plan the trip. Split the costs. / দলবল নিয়ে ঘুরি, হিসাব রাখি", and `#0f6b4a` brand backdrop.
- [ ] **Favicon** (`src/app/favicon.ico` or `public/favicon.ico`):
  - Multi-resolution ICO containing 16x16, 32x32, and 48x48 icon slices.
- [ ] **Standard Web Icon** (`src/app/icon.png` or `public/icon.png`):
  - Dimensions: `192 x 192` px and `512 x 512` px for progressive web apps and mobile home screen shortcuts.
- [ ] **Apple Touch Icon** (`src/app/apple-touch-icon.png` or `public/apple-touch-icon.png`):
  - Dimensions: `180 x 180` px square PNG (opaque background with brand green `#0f6b4a`).
- [ ] **Web App Manifest** (`src/app/manifest.ts` or `public/manifest.webmanifest`):
  - `name`: "Dolbol - Trip & Costs"
  - `short_name`: "Dolbol"
  - `theme_color`: "#0f6b4a"
  - `background_color`: "#ffffff"
  - `display`: "standalone"

---

## 4. Production Environment Configuration (`NEXT_PUBLIC_SITE_URL`)

1. In your **Vercel Project Settings** > **Environment Variables**:
   - Variable name: `NEXT_PUBLIC_SITE_URL`
   - Production value: `https://dolbol.app` (or your chosen production domain, e.g. `https://dolbol.vercel.app`)
   - Preview value (optional): `https://${VERCEL_URL}` or staging domain
   - Ensure target environment includes **Production** and **Preview**.
2. Run `pnpm build` or redeploy on Vercel.
3. Validate that `getSiteUrl()` outputs the production origin in all generated sitemap and metadata links.

---

## 5. Domain Change & 301 Redirect Setup

If migrating from an existing domain (e.g. `triphub.app` or `trip-hub-one.vercel.app`):

1. **Vercel Domain Settings**:
   - Navigate to **Project Settings > Domains**.
   - Add new domain: `dolbol.app` (set as Primary).
   - If retaining the old domain for forwarding: add `triphub.app`, choose **Redirect to dolbol.app**, and select **Status Code: 301 Moved Permanently**.
2. **Path Preservation**:
   - Ensure redirects preserve paths and query parameters so existing invite links (e.g., `triphub.app/trips/sajek-2026`) seamlessly redirect to `https://dolbol.app/trips/sajek-2026`.
3. **Canonical Verification**:
   - Check response with:
     ```bash
     curl -sI https://old-domain.com/ | grep -i "location:"
     # Expect: location: https://dolbol.app/
     ```

---

## 6. Social Scraper Re-scrape (Facebook, Messenger, WhatsApp)

Social platforms cache Open Graph tags. To refresh previews for the renamed product:

1. **Facebook Sharing Debugger**:
   - Visit: [https://developers.facebook.com/tools/debug/](https://developers.facebook.com/tools/debug/)
   - Enter your site URL: `https://dolbol.app/`
   - Click **Debug**.
   - If cached information is displayed, click **Scrape Again** to fetch fresh metadata and images.
2. **Trip Previews**:
   - Test a sample trip invite URL in the debugger (e.g., `https://dolbol.app/trips/<slug>`).
   - Confirm that:
     - `og:title` shows: `<Trip Name> | Dolbol`
     - `og:description` shows the invitation text.
     - No financial data (amounts, expenses, settlements) is visible in the preview.
3. **WhatsApp / Messenger**:
   - Sharing the link in a chat will fetch the newly refreshed Open Graph card from Facebook's cache.

---

## 7. Google Search Console Change-of-Address & Verification

1. **Add Property**:
   - Open [Google Search Console](https://search.google.com/search-console).
   - Add the new domain property: `https://dolbol.app`.
   - Verify ownership via DNS TXT record (recommended) or HTML meta tag.
2. **Submit Sitemap**:
   - In Search Console under **Index > Sitemaps**, enter: `sitemap.xml` and click **Submit**.
   - Verify that Google finds 1 URL (`https://dolbol.app/`) and status reports **Success**.
3. **Change of Address Tool** (if changing domain from previously indexed site):
   - Under Settings in the old Search Console property, select **Change of address**.
   - Select the new property (`https://dolbol.app`).
   - Run validation (checks that 301 redirects are in place) and submit the migration request.
4. **Inspect Private Trip URLs**:
   - In Search Console, inspect any `/trips/<slug>` URL using the **URL Inspection** tool.
   - Confirm that Google displays:
     - **Indexing allowed?**: No (`X-Robots-Tag: noindex` detected).
     - Page is excluded from search index.
