# Step 6 — Manual Acceptance Verification Checklist (AI Expense Parser)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Bangla & Banglish Natural Text Parsing + Confirm Card (Never Auto-Saves)

- [ ] At the top of `/trips/<slug>`, locate the **✨ এআই মেসেজ পার্সার (বাংলা / বাংলিশ) (`AI Expense Parser`)** card.
- [ ] Tap the first example chip or type:
      `রাতের খাবার ১২০০ টাকা করিম দিয়েছে সবাই`
      and click **এআই দিয়ে হিসাব বের করুন (`Parse Expense with AI`)**.
- [ ] Verify the **কনফার্ম কার্ড (`Confirm Card (Not saved yet)`)** opens **without** adding the expense to the trip yet (refreshing or clicking **বাতিল করুন (`Discard`)** leaves balances unchanged).
- [ ] Verify the Confirm Card pre-fills:
  - Title: `রাতের খাবার`
  - Amount: `1200`
  - Category: `🍛 খাবার (Food)`
  - Payer: `Karim` (`করিম`)
  - Participants: all trip members checked
- [ ] Click **✓ নিশ্চিত করুন ও খরচ সেভ করুন (`Confirm & Save Expense`)** and verify the expense is now saved with `rawInput` preserved.

## 2. Subset Participant & Pronoun (`আমি` / `ami`) Matching

- [ ] Type a Banglish subset sentence:
      `CNG bhara 450 tk Tanvir dilo for Karim, Tanvir and Sumi`
      and click Parse.
- [ ] Verify the Confirm Card pre-selects `🚗 যাতায়াত (Transport)`, Amount `450`, Payer `Tanvir`, and checks **only** `Karim`, `Tanvir`, and `Sumi`.
- [ ] Type a first-person sentence:
      `হোটেল বুকিং ৩০০০ টাকা আমি দিয়েছি`
      and verify Payer resolves to your currently signed-in member.

## 3. 25-Sentence Benchmark & Rate Limiter Suite

- [ ] Run `pnpm test` and verify `src/lib/__tests__/step6-ai-parser.test.ts` scores **25/25 (100%)** on `src/lib/__tests__/fixtures/bangla-banglish-25.json` and passes the per-trip and per-IP `SlidingWindowRateLimiter` tests.
