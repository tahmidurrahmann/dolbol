# Step 5 — Manual Acceptance Verification Checklist (Destination Voting & Itinerary)

Run through each check below on `http://localhost:3000/trips/<slug>` with `pnpm dev` running.

## 1. Destination Options & One Vote Per Member

- [ ] Scroll to **গন্তব্য নির্বাচন ও ভোট (`Destination Voting`)** and add two destination options: `সুন্দরবন` and `সাজেক ভ্যালি`.
- [ ] Verify that proposing an option automatically casts your vote for it (`১ ভোট (১০০%)` / `✓ আপনার ভোট`).
- [ ] Try proposing a duplicate option (`সুন্দরবন` or ` সুন্দরবন`). Verify it is rejected with the duplicate-option error.
- [ ] Click **ভোট দিন (`Vote`)** on the other option (`সুন্দরবন`). Verify your vote moves from `সাজেক ভ্যালি` to `সুন্দরবন` (still 1 vote total for your member, enforced by `@@unique([tripId, memberId])`).
- [ ] Switch to a second member (using **নাম পরিবর্তন / রিক্লেইম টেস্ট করুন**) and vote for `সুন্দরবন`. Verify `সুন্দরবন` shows `২ ভোট (১০০%)`, both member badges (`🐅 Karim`, `🌴 Sumi`), and the **🏆 শীর্ষ পছন্দ (`🏆 Top pick`)** badge.
- [ ] As the trip creator, click **ট্রিপের চূড়ান্ত গন্তব্য করুন (`Set as final trip destination`)** on the winning option and verify the trip header updates its destination.

## 2. Day-by-Day Itinerary (Add, Order, Reorder & Delete)

- [ ] Scroll to **প্রতিদিনের ভ্রমণ সূচি (`Day-by-Day Itinerary`)** and add 2 items for Day 1 (`দিন: ১`):
  - Time: `08:30`, Activity: `খুলনা ঘাট থেকে লঞ্চে যাত্রা`, Notes: `সকাল ৮টার মধ্যে ঘাটে উপস্থিত থাকতে হবে`
  - Time: `13:30`, Activity: `হাড়বাড়িয়া ইকো ট্যুরিজম কেন্দ্র ভ্রমণ`
- [ ] Add 1 item for Day 2 (`দিন: ২`):
  - Time: `06:00`, Activity: `কটকা অভয়ারণ্যে ভোরের ট্রেইল`
- [ ] Verify the items are grouped under **দিন ১ · ১৬ অক্টো, ২০২৬** and **দিন ২ · ১৭ অক্টো, ২০২৬** (matching the trip's `Asia/Dhaka` start date).
- [ ] Click the **`↑`** / **`↓`** buttons on Day 1's items and verify their order swaps cleanly.
- [ ] Click **মুছুন (`Delete`)** on an item and verify it is removed and logged in the Activity Log.
