# Step 3 — Manual Acceptance Verification Checklist (Money Core)

Run through this 5-person, 3-day trip scenario on `http://localhost:3000` with `pnpm dev` running to verify every balance to the exact taka.

## 1. Set Up a 5-Person, 3-Day Trip (Including a Guest)

- [ ] Create a new trip at `/trips/new` with:
  - Trip Name: `সুন্দরবন ট্যুর` (`Sundarbans Tour`)
  - Start Date: `2026-10-16`, End Date: `2026-10-18`
  - Creator Name: `Karim` (`🐅`)
- [ ] Add 3 more members (`Sumi` `🌴`, `Tanvir` `🚤`, `Nabila` `📸`) and 1 guest via Creator Controls (`Mamun` `👤`). Confirm total members = `5`.

## 2. Log 5 Expenses Across Pre-Trip ("Other dates") and Days 1–3

- [ ] **Expense 1 (Pre-trip / "Other dates" — Equal 5-way)**:
  - Title: `Advance Bus Tickets`, Amount: `2500`, Category: `Ticket`, Date: `2026-10-14`, Paid by: `Karim`, Split: `Equal` (all 5 checked).
  - Verify it appears under **অন্যান্য তারিখ** (`Other dates`) with `৳500` per person.
- [ ] **Expense 2 (Day 1 — Equal 5-way)**:
  - Title: `Resort Check-in`, Amount: `5000`, Category: `Hotel`, Date: `2026-10-16`, Paid by: `Sumi`, Split: `Equal` (all 5 checked).
  - Verify it appears under **দিন ১ · ১৬ অক্টো, ২০২৬** (`Day 1 · 16 Oct 2026`) with `৳1,000` per person.
- [ ] **Expense 3 (Day 1 — 3-way Subset with Integer Rounding Leftover)**:
  - Title: `Late Night Tea`, Amount: `100`, Category: `Food`, Date: `2026-10-16`, Paid by: `Tanvir`, Split: `Equal` (check **only** `Tanvir`, `Karim`, and `Mamun`).
  - Verify `Tanvir` (the payer) gets the rounding leftover (`৳34`), while `Karim` and `Mamun` get `৳33` each (`34 + 33 + 33 = 100`).
  - Verify **Day 1 total** is `৳5,100` (`৳5,000 + ৳100`), and Day 1 per-person cost shows `Tanvir: ৳1,034`, `Karim: ৳1,033`, `Mamun: ৳1,033`, `Sumi: ৳1,000`, `Nabila: ৳1,000`.
- [ ] **Expense 4 (Day 2 — Exact Split)**:
  - Title: `Seafood Dinner`, Amount: `2000`, Category: `Food`, Date: `2026-10-17`, Paid by: `Nabila`, Split: `Exact (৳)` with `Karim: 400`, `Sumi: 350`, `Tanvir: 450`, `Nabila: 400`, `Mamun: 400`.
  - Verify **Day 2 total** is `৳2,000`.
- [ ] **Expense 5 (Day 3 — Percent Split)**:
  - Title: `CNG to Station`, Amount: `1200`, Category: `Transport`, Date: `2026-10-18`, Paid by: `Karim`, Split: `Percent (%)` with `Karim: 60`, `Tanvir: 40`.
  - Verify shares are `Karim: ৳720` and `Tanvir: ৳480`, and **Day 3 total** is `৳1,200`.

## 3. Verify Balances & Simplified Debts to the Exact Taka

- [ ] Check **Total Trip Spend**: `৳10,800` (`2500 + 5000 + 100 + 2000 + 1200`).
- [ ] Record a **Settlement**: `Tanvir` paid back `Sumi` `৳1,000`.
- [ ] Verify the **Per-Member Breakdown** table matches to the exact single taka:
  - `Karim`: Paid `৳3,700`, Share `৳2,653`, Net **`+৳1,047` (gets)**
  - `Sumi`: Paid `৳5,000`, Share `৳1,850` (minus `৳1,000` settlement received), Net **`+৳2,150` (gets)**
  - `Tanvir`: Paid `৳100`, Share `৳2,464` (plus `৳1,000` settlement sent), Net **`-৳1,364` (owes)**
  - `Nabila`: Paid `৳2,000`, Share `৳1,900`, Net **`+৳100` (gets)**
  - `Mamun (Guest)`: Paid `৳0`, Share `৳1,933`, Net **`-৳1,933` (owes)**
- [ ] Verify **Who Owes Whom (Simplified)** shows these 4 exact transfers (total `৳3,297`):
  - `Mamun` → owes → `Sumi`: **`৳1,933`**
  - `Tanvir` → owes → `Sumi`: **`৳217`**
  - `Tanvir` → owes → `Karim`: **`৳1,047`**
  - `Tanvir` → owes → `Nabila`: **`৳100`**

## 4. Verify Edit After a Settlement Flagging

- [ ] Click **এডিট** (`Edit`) on `Resort Check-in` (or any expense) and update its amount or note after the `৳1,000` settlement has been logged.
- [ ] Verify the expense card displays the amber warning badge **⚠️ লেনদেন নিষ্পত্তির পরে এডিট করা হয়েছে** (`⚠️ Edited after a settlement`) and all balances recalculate immediately on read.
