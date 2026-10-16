# Step 2 — Manual Acceptance Verification Checklist (Trips & Joining)

Run through each check below with `pnpm dev` running on `http://localhost:3000`.

## 1. Create a Trip with a Long Random Slug

- [ ] Open `http://localhost:3000` and click **নতুন ট্রিপ তৈরি করুন** (`Create a trip`).

- [ ] Enter Trip Name (`সুন্দরবন ভ্রমণ`), Destination (`খুলনা`), your name (`করিম`), pick an emoji (`🐅`), set an optional PIN (`১২৩৪`), and submit.

- [ ] Verify you are redirected to `/trips/<slug>` where `<slug>` is a 22-character random URL-safe string (not a sequential integer or predictable name).

- [ ] Verify the header badge shows you signed in as `🐅 করিম` with the **ক্রিয়েটর** (`Creator`) and `🔒 পিন সেট` (`PIN set`) badges.

## 2. Second Phone / Incognito Browser Joins via Shared Link

- [ ] Copy the `/trips/<slug>` URL using the **লিংক কপি করুন** (`Copy link`) button (or paste the URL/slug into `http://localhost:3000/trips/join` in an Incognito window or second phone).

- [ ] Verify the **"আপনি কে?" (`Who are you?`)** screen appears because the second browser has no device session cookie for this trip.

- [ ] Try joining as a new member with the **same name** (`করিম` or `  করিম  `). Verify it is rejected with the duplicate-name error (`@@unique([tripId, nameKey])`).

- [ ] Join as a new member with a unique name (`তানভীর`), emoji (`🚤`), and no PIN. Verify `তানভীর` is signed in and both browsers now show 2 members (`করিম` and `তানভীর`).

## 3. Cleared Browser Reclaims Its Name (With & Without PIN)

- [ ] On the second browser (signed in as `তানভীর`), click **নাম পরিবর্তন / রিক্লেইম টেস্ট করুন** (`Switch member / Test reclaim`) or clear browser cookies.

- [ ] Verify the **"আপনি কে?" (`Who are you?`)** screen lists both `🐅 করিম (🔒 পিন দেওয়া আছে)` and `🚤 তানভীর (পিন ছাড়া এক ট্যাপে প্রবেশ)`.

- [ ] Tap **এই নামে প্রবেশ করুন** next to `🚤 তানভীর` and verify one-tap reclaim logs you back in as `তানভীর` with a fresh `MemberSession` token cookie.

- [ ] Click **নাম পরিবর্তন / রিক্লেইম টেস্ট করুন** again and try reclaiming `🐅 করিম` with a wrong PIN (`9999`). Verify it fails with the wrong-PIN error.

- [ ] Reclaim `🐅 করিম` using PIN `1234` (or Bangla digits `১২৩৪`) and verify both ASCII and Bangla digits succeed and restore creator access.

## 4. Creator Controls: Add Guest, Rename Member, and Lock Trip

- [ ] While signed in as the creator (`🐅 করিম`), add a guest (`নাবিলা`, emoji `🌴`) in the **গেস্ট সদস্য যোগ করুন** (`Add a guest member`) form.

- [ ] Verify `🌴 নাবিলা` appears in the members list with the **গেস্ট** (`Guest`) badge, and verify `নাবিলা` does **not** appear in the reclaimable device-member list on the "Who are you?" screen.

- [ ] In **সদস্যের নাম বা ইমোজি পরিবর্তন করুন** (`Rename or update emoji`), rename `তানভীর` to `তানভীর আহমেদ` and change his emoji to `🎸`. Verify the member list updates immediately.

- [ ] Click **ট্রিপ লক করুন** (`Lock trip`). Verify the trip status badge changes to `🔒 ট্রিপ লকড` (`Trip Locked`), the Add Guest and Rename forms hide, and an Incognito user opening `/trips/<slug>` sees the locked notice instead of the new-member join form (while existing members can still reclaim their names).

- [ ] Click **ট্রিপ আনলক করুন** (`Unlock trip`) to unlock the trip again.
