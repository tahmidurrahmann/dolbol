# Step 7 — Manual Acceptance Verification Checklist (Share Card & Daily Cost Sheet)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Public Read-Only Summary Page (`/trips/[slug]/summary` — No Money Details)
- [ ] Scroll to **📤 শেয়ার কার্ড ও ডেইলি কস্ট শিট (`Share Card & Daily Cost Sheet`)** on `/trips/<slug>` and click **পাবলিক সামারি দেখুন (`Open Public Summary`)**.
- [ ] Verify `/trips/<slug>/summary` opens even in an Incognito browser (no session cookie required).
- [ ] Verify it shows the Trip Name, Destination, Dates, Member badges, and Day-by-Day Itinerary—and **zero** expense amounts, balances, or settlements.
- [ ] Inspect `<head>` on `/trips/<slug>/summary` and confirm `<meta property="og:image" content=".../api/trips/<slug>/share-image" />` is present.

## 2. Shareable Summary Image (`/api/trips/[slug]/share-image`)
- [ ] Verify the `1200x630` PNG preview renders on both `/trips/<slug>` and `/trips/<slug>/summary` with Bangla + English typography and no money details.
- [ ] Click **📥 ইমেজ কার্ড ডাউনলোড করুন (PNG) (`Download Summary Image (PNG)`)** and confirm `trip-summary-<slug>.png` downloads cleanly.

## 3. Downloadable Daily Cost Sheet (Per-Day Totals + Per-Person Totals + Who Owes Whom)
- [ ] While signed in as a trip member on `/trips/<slug>`, click **📥 CSV (Excel) ডাউনলোড করুন (`Download CSV (Excel)`)**.
- [ ] Open `trip-cost-sheet-<slug>.csv` in Excel, Numbers, or Google Sheets and verify:
  - Bangla text renders properly (UTF-8 BOM `\uFEFF`).
  - **Section 1**: Per-Day Totals & Per-Person Daily Cost matrix.
  - **Section 2**: Per-Person Overall Totals (`Paid`, `Share`, `Sent`, `Received`, `Net Balance`).
  - **Section 3**: Simplified **Who Owes Whom** transfers.
  - **Section 4**: Itemized daily expenses.
- [ ] Click **🖨️ প্রিন্ট / PDF ভিউ খুলুন (`Open Printable / PDF View`)** (`/api/trips/<slug>/cost-sheet?format=html`) and verify the print/PDF view displays all 4 sections and triggers `window.print()` cleanly.
- [ ] In an Incognito window (without a member session cookie), visit `/api/trips/<slug>/cost-sheet` and verify it returns `401 Unauthorized` (protecting private financial details).
