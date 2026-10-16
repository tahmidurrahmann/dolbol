# Step 4 — Manual Acceptance Verification Checklist (Safety Layer)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Duplicate-Entry Warning (Live Banner & Server Guard)

- [ ] In the **Add an Expense** form, type the exact same Title (`Seafood Dinner`), Amount (`2000`), Category (`Food`), and Date (`2026-10-17`) as an existing active expense on the trip.
- [ ] Verify the amber **⚠️ সম্ভাব্য ডুপ্লিকেট খরচ! (`⚠️ Possible Duplicate Expense!`)** banner appears immediately in the form, showing the matching existing expense (`"Seafood Dinner" (৳2000)`) and requiring the **আমি নিশ্চিত, এটি আলাদা খরচ (`I confirm this is a separate expense`)** checkbox before saving.
- [ ] Check the confirmation checkbox and submit. Verify the expense saves cleanly when confirmed.

## 2. Edit History & Flagging Edits Made After a Settlement

- [ ] Ensure at least one settlement is recorded on the trip (e.g., `Tanvir` paid back `Sumi` `৳1,000`).
- [ ] Click **এডিট (`Edit`)** on an existing expense (e.g., change `Resort Check-in` from `5000` to `5500` and title to `Resort Check-in + Extra Bed`) and save.
- [ ] On the updated expense card in the Per-Day view:
  - [ ] Verify the amber **⚠️ লেনদেন নিষ্পত্তির পরে এডিট করা হয়েছে (`⚠️ Edited after a settlement`)** badge is displayed.
  - [ ] Click **এডিট হিস্ট্রি দেখুন (`View edit history (1)`)** and verify it expands to show who edited the expense, the date, the title diff (`"Resort Check-in" → "Resort Check-in + Extra Bed"`), and the amount diff (`৳৫,০০০ → ৳৫,৫০০` / `৳5,000 → ৳5,500`).

## 3. Soft Delete Everywhere & Immutable Activity Log

- [ ] Click **মুছুন (`Delete`)** on the duplicate expense you created in Step 1.
- [ ] Verify it disappears from the active Per-Day view and balances, **and** scroll down to **অ্যাক্টিভিটি লগ ও পরিবর্তন ইতিহাস (`Activity Log & Audit Trail`)** to confirm a red audit entry (`খরচ মুছে ফেলেছেন (Soft-deleted): "Seafood Dinner" (৳২,০০০)`) is permanently recorded.
- [ ] Open `pnpm db:studio` (or inspect Postgres) and confirm the `Expense` row still exists in the database with a non-null `deletedAt` timestamp (never hard-deleted).

## 4. Locked Trips Block Every Write Route

- [ ] As the trip creator, click **ট্রিপ লক করুন (`Lock trip`)**.
- [ ] Verify the Add Expense form, Edit/Delete expense buttons, Record/Delete settlement forms, Add Guest form, and Rename Member forms are all hidden, and any direct POST to a write action redirects with the `trip_locked` error.
- [ ] Click **ট্রিপ আনলক করুন (`Unlock trip`)** to restore write access.

## 5. Automated Unit Tests for Share-Sum & Cross-Trip Vote Guards

- [ ] Run `pnpm test` and confirm `src/lib/__tests__/step4-safety.test.ts` passes all unit tests for `assertTripWritable`, `assertValidExpenseSharesForTrip`, `assertVoteOptionBelongsToTrip`, `findDuplicateExpenseCandidate`, and `extractExpenseEditHistory`.
