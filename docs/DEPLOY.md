# Deploying Trip Hub to Production (Vercel + Neon or Supabase)

Follow this guide to deploy Trip Hub and test the complete flow on two real phones over mobile data.

## 1. Provision a Managed PostgreSQL 16 Database (Neon or Supabase)

1. Create a free PostgreSQL 16 project on **[Neon](https://neon.tech)** (recommended region: Singapore `ap-southeast-1` for lowest latency from Bangladesh) or **[Supabase](https://supabase.com)**.
2. Copy your PostgreSQL connection string (`DATABASE_URL`), for example:
   ```text
   postgresql://neondb_owner:password@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

## 2. Apply Prisma Migrations to Your Cloud Database

From your laptop inside `trip-hub/`, run the production migration deploy command against your cloud `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

## 3. Deploy to Vercel

1. Push your `trip-hub` repository to GitHub.
2. Import the repository into **[Vercel](https://vercel.com/new)**.
3. In **Environment Variables**, add:
   - `DATABASE_URL` = your Neon / Supabase PostgreSQL URL
   - `NODE_ENV` = `production`
   - `GEMINI_API_KEY` = *(optional)* your Gemini API key if you want live LLM calls before the deterministic Bangla/Banglish parser fallback
4. Click **Deploy** (Vercel automatically runs `pnpm build`, which executes `prisma generate && next build`).
5. Once deployed, verify `https://<your-domain>.vercel.app/api/health` returns `{"ok":true}` (`200 OK`).

## 4. Two-Phone Real Mobile Data Acceptance Test (~15 mins)

1. **Phone 1 (Creator, on 4G/5G mobile data)**:
   - Open `https://<your-domain>.vercel.app` and create a trip (`সুন্দরবন ট্যুর ২০২৬`, creator `Karim`, PIN `1234`).
   - Add a guest member (`Mamun`), propose 2 destination options (`সুন্দরবন`, `সাজেক ভ্যালি`), and add Day 1 itinerary items.
   - Tap **শেয়ার করুন (`Share link`)** and send the `/trips/<slug>` link to Phone 2 over WhatsApp or Messenger.
2. **Phone 2 (Friend, on 4G/5G mobile data)**:
   - Tap the WhatsApp/Messenger link, join as `Tanvir`, vote for `সুন্দরবন`, and use the **AI Expense Parser** to parse `"রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই"`, review the Confirm Card, and save.
3. **Both Phones**:
   - Verify balances (`কে কাকে কত টাকা দেবে`), per-day breakdowns, and the Activity Log match to the exact single taka (`৳`).
   - Open `/trips/<slug>/summary` and download both the Share Image PNG and the Daily Cost Sheet CSV/PDF.
