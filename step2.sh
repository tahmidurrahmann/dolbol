#!/usr/bin/env bash

set -euo pipefail



if [ -f "./package.json" ] && [ -d "./src" ]; then

  PROJECT_DIR="."

elif [ -d "./trip-hub" ]; then

  PROJECT_DIR="./trip-hub"

else

  echo "ERROR: Run step2.sh either inside trip-hub/ or from its parent directory." >&2

  exit 1

fi



echo "==> Applying Step 2 (Trips, Joining, Device Sessions & Creator Controls) to ${PROJECT_DIR} ..."

mkdir -p \

  "${PROJECT_DIR}/docs" \

  "${PROJECT_DIR}/src/lib/__tests__" \

  "${PROJECT_DIR}/src/components" \

  "${PROJECT_DIR}/src/messages" \

  "${PROJECT_DIR}/src/app/trips/new" \

  "${PROJECT_DIR}/src/app/trips/join" \

  "${PROJECT_DIR}/src/app/trips/[slug]"



cat > "${PROJECT_DIR}/src/lib/crypto.ts" <<'EOF'

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";



const BANGLA_DIGIT_CHARS = "০১২৩৪৫৬৭৮৯";



/**

 * Converts Bangla digits (০-৯) in a string to ASCII digits (0-9).

 */

export function banglaToAsciiDigits(input: string): string {

  return input.replace(/[০-৯]/g, (ch) => {

    const idx = BANGLA_DIGIT_CHARS.indexOf(ch);

    return idx >= 0 ? String(idx) : ch;

  });

}



/**

 * Generates a cryptographically random URL-safe slug (16 bytes = 22 base64url chars).

 */

export function generateTripSlug(): string {

  return randomBytes(16).toString("base64url");

}



/**

 * Generates a cryptographically random raw session token (32 bytes = 43 base64url chars).

 */

export function generateSessionToken(): string {

  return randomBytes(32).toString("base64url");

}



/**

 * Computes the SHA-256 hex digest of a raw session token for storage in MemberSession.tokenHash.

 */

export function hashSessionToken(rawToken: string): string {

  if (!rawToken || rawToken.trim().length === 0) {

    throw new Error("Session token cannot be empty.");

  }

  return createHash("sha256").update(rawToken, "utf8").digest("hex");

}



/**

 * Normalizes a member displayName into a canonical nameKey for per-trip uniqueness checks:

 * NFC unicode normalization, collapsed internal whitespace, trimmed, and lowercased.

 */

export function normalizeNameKey(displayName: string): string {

  return displayName

    .normalize("NFC")

    .trim()

    .replace(/\s+/g, " ")

    .toLowerCase();

}



/**

 * Normalizes and validates an optional 4-to-6 digit PIN (accepting either Bangla or ASCII digits).

 * Returns null if pin is empty/undefined; throws RangeError if non-empty and invalid.

 */

export function normalizePin(rawPin: string | null | undefined): string | null {

  if (!rawPin) {

    return null;

  }

  const trimmed = banglaToAsciiDigits(rawPin.trim());

  if (trimmed.length === 0) {

    return null;

  }

  if (!/^\d{4,6}$/.test(trimmed)) {

    throw new RangeError("PIN must be 4 to 6 digits.");

  }

  return trimmed;

}



/**

 * Hashes a 4-to-6 digit PIN using scrypt with a 16-byte random salt.

 */

export function hashPin(rawPin: string): string {

  const normalized = normalizePin(rawPin);

  if (!normalized) {

    throw new RangeError("PIN must be 4 to 6 digits.");

  }

  const salt = randomBytes(16).toString("hex");

  const derived = scryptSync(normalized, salt, 64).toString("hex");

  return `scrypt:${salt}:${derived}`;

}



/**

 * Verifies a candidate PIN against a stored scrypt hash in constant time.

 */

export function verifyPin(candidatePin: string, storedHash: string): boolean {

  let normalized: string | null = null;

  try {

    normalized = normalizePin(candidatePin);

  } catch {

    return false;

  }

  if (!normalized) {

    return false;

  }



  const parts = storedHash.split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt") {

    return false;

  }

  const salt = parts[1];

  const expectedHex = parts[2];

  if (!salt || !expectedHex) {

    return false;

  }



  const expectedBuf = Buffer.from(expectedHex, "hex");

  const candidateBuf = scryptSync(normalized, salt, 64);



  if (expectedBuf.length !== candidateBuf.length) {

    return false;

  }

  return timingSafeEqual(expectedBuf, candidateBuf);

}



/**

 * Extracts a clean trip slug from either a pasted full URL (e.g. https://.../trips/abc-123)

 * or a raw slug string. Returns null if invalid.

 */

export function extractSlugFromInput(rawInput: string): string | null {

  const trimmed = rawInput.trim();

  if (!trimmed) {

    return null;

  }



  const urlMatch = trimmed.match(/\/trips\/([A-Za-z0-9_-]{8,64})(?:[/?#]|$)/);

  if (urlMatch && urlMatch[1]) {

    return urlMatch[1];

  }



  if (/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) {

    return trimmed;

  }



  return null;

}

EOF



cat > "${PROJECT_DIR}/src/lib/session.ts" <<'EOF'

import { cookies } from "next/headers";

import type { Member } from "@/generated/prisma/client";

import {

  generateSessionToken,

  hashSessionToken,

} from "@/lib/crypto";

import { db } from "@/lib/db";

import { env } from "@/lib/env";



const SESSION_COOKIE_PREFIX = "th_session_";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days



export function getTripSessionCookieName(tripId: string): string {

  return `${SESSION_COOKIE_PREFIX}${tripId.replace(/[^a-zA-Z0-9]/g, "")}`;

}



/**

 * Issues a new device session row in MemberSession (storing only the SHA-256 hash)

 * and sets the httpOnly session cookie for the specified trip.

 */

export async function createMemberDeviceSession(

  memberId: string,

  tripId: string,

): Promise<void> {

  const rawToken = generateSessionToken();

  const tokenHash = hashSessionToken(rawToken);



  await db.memberSession.create({

    data: {

      memberId,

      tokenHash,

    },

  });



  const cookieStore = await cookies();

  cookieStore.set(getTripSessionCookieName(tripId), rawToken, {

    httpOnly: true,

    sameSite: "lax",

    path: "/",

    maxAge: SESSION_MAX_AGE_SECONDS,

    secure: env.NODE_ENV === "production",

  });

}



/**

 * Resolves the currently signed-in Member for a trip from the device session cookie.

 * Returns null if no valid cookie/session exists or if the member belongs to a different trip.

 */

export async function getCurrentMemberForTrip(

  tripId: string,

): Promise<Member | null> {

  const cookieStore = await cookies();

  const rawToken = cookieStore.get(getTripSessionCookieName(tripId))?.value;

  if (!rawToken) {

    return null;

  }



  let tokenHash: string;

  try {

    tokenHash = hashSessionToken(rawToken);

  } catch {

    return null;

  }



  const session = await db.memberSession.findUnique({

    where: { tokenHash },

    include: { member: true },

  });



  if (!session || session.member.tripId !== tripId || session.member.isGuest) {

    return null;

  }



  // Update lastSeenAt non-fatally

  await db.memberSession

    .update({

      where: { id: session.id },

      data: { lastSeenAt: new Date() },

    })

    .catch(() => undefined);



  return session.member;

}



/**

 * Clears the current device session cookie and removes the MemberSession row

 * so a user can switch identities or test reclaiming their name on the same browser.

 */

export async function clearMemberDeviceSession(tripId: string): Promise<void> {

  const cookieStore = await cookies();

  const cookieName = getTripSessionCookieName(tripId);

  const rawToken = cookieStore.get(cookieName)?.value;



  if (rawToken) {

    try {

      const tokenHash = hashSessionToken(rawToken);

      await db.memberSession.deleteMany({

        where: { tokenHash },

      });

    } catch {

      // Ignore invalid token hash on sign-out

    }

  }



  cookieStore.delete(cookieName);

}

EOF



cat > "${PROJECT_DIR}/src/lib/trips.ts" <<'EOF'

import { z } from "zod";

import { banglaToAsciiDigits } from "@/lib/crypto";



export const MEMBER_EMOJIS = [

  "🎒",

  "🌴",

  "🚤",

  "🏔️",

  "📸",

  "🍵",

  "🎸",

  "🕶️",

  "🐅",

  "🌊",

  "⛺",

  "🚲",

] as const;



export type MemberEmoji = (typeof MEMBER_EMOJIS)[number];



const optionalDateString = z

  .string()

  .trim()

  .optional()

  .transform((val) => (val && val.length > 0 ? val : undefined))

  .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {

    message: "invalid_date",

  });



const optionalPinString = z

  .string()

  .trim()

  .optional()

  .transform((val) => {

    if (!val) return undefined;

    const ascii = banglaToAsciiDigits(val.trim());

    return ascii.length > 0 ? ascii : undefined;

  })

  .refine((val) => !val || /^\d{4,6}$/.test(val), {

    message: "invalid_pin",

  });



const optionalEmojiString = z

  .string()

  .trim()

  .optional()

  .transform((val) => (val && val.length > 0 ? val : "🎒"));



export const createTripFormSchema = z.object({

  name: z.string().trim().min(2, "trip_name_short").max(80, "trip_name_long"),

  destination: z

    .string()

    .trim()

    .max(80, "destination_long")

    .optional()

    .transform((val) => (val && val.length > 0 ? val : undefined)),

  startDate: optionalDateString,

  endDate: optionalDateString,

  creatorName: z

    .string()

    .trim()

    .min(1, "member_name_required")

    .max(40, "member_name_long"),

  creatorEmoji: optionalEmojiString,

  creatorPin: optionalPinString,

});



export const joinTripFormSchema = z.object({

  slug: z.string().trim().min(8).max(64),

  displayName: z

    .string()

    .trim()

    .min(1, "member_name_required")

    .max(40, "member_name_long"),

  emoji: optionalEmojiString,

  pin: optionalPinString,

});



export const reclaimMemberFormSchema = z.object({

  slug: z.string().trim().min(8).max(64),

  memberId: z.string().uuid(),

  pin: optionalPinString,

});



export const renameMemberFormSchema = z.object({

  slug: z.string().trim().min(8).max(64),

  memberId: z.string().uuid(),

  displayName: z

    .string()

    .trim()

    .min(1, "member_name_required")

    .max(40, "member_name_long"),

  emoji: optionalEmojiString,

});



export const addGuestFormSchema = z.object({

  slug: z.string().trim().min(8).max(64),

  displayName: z

    .string()

    .trim()

    .min(1, "member_name_required")

    .max(40, "member_name_long"),

  emoji: optionalEmojiString,

});

EOF



cat > "${PROJECT_DIR}/src/lib/__tests__/step2-auth-and-slug.test.ts" <<'EOF'

import { describe, expect, it } from "vitest";

import {

  banglaToAsciiDigits,

  extractSlugFromInput,

  generateSessionToken,

  generateTripSlug,

  hashPin,

  hashSessionToken,

  normalizeNameKey,

  normalizePin,

  verifyPin,

} from "@/lib/crypto";



describe("generateTripSlug & generateSessionToken", () => {

  it("generates URL-safe 22-char base64url trip slugs that are unique", () => {

    const slugA = generateTripSlug();

    const slugB = generateTripSlug();

    expect(slugA).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(slugB).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(slugA).not.toBe(slugB);

  });



  it("generates 43-char base64url session tokens and deterministic 64-char SHA-256 hex hashes", () => {

    const raw = generateSessionToken();

    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const hash1 = hashSessionToken(raw);

    const hash2 = hashSessionToken(raw);

    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    expect(hash1).toBe(hash2);

    expect(hash1).not.toBe(raw);

  });

});



describe("normalizeNameKey", () => {

  it("trims, collapses internal spaces, and lowercases Latin and Bangla names", () => {

    expect(normalizeNameKey("  Rahim   Ahmed  ")).toBe("rahim ahmed");

    expect(normalizeNameKey("RAHIM ahmed")).toBe("rahim ahmed");

    expect(normalizeNameKey("  রহিম   আহমেদ ")).toBe("রহিম আহমেদ");

  });

});



describe("PIN normalization, scrypt hashing, and verification", () => {

  it("converts Bangla digits in PINs to ASCII digits", () => {

    expect(banglaToAsciiDigits("১২৩৪")).toBe("1234");

    expect(normalizePin(" ১২৩৪ ")).toBe("1234");

    expect(normalizePin("")).toBeNull();

    expect(normalizePin(null)).toBeNull();

  });



  it("rejects non-numeric or out-of-range PIN lengths", () => {

    expect(() => normalizePin("123")).toThrow(RangeError);

    expect(() => normalizePin("1234567")).toThrow(RangeError);

    expect(() => normalizePin("12a4")).toThrow(RangeError);

  });



  it("hashes a PIN with random salt and verifies both ASCII and Bangla digit inputs", () => {

    const hash = hashPin("১২৩৪");

    expect(hash.startsWith("scrypt:")).toBe(true);

    expect(verifyPin("1234", hash)).toBe(true);

    expect(verifyPin("১২৩৪", hash)).toBe(true);

    expect(verifyPin("9999", hash)).toBe(false);

    expect(verifyPin("invalid", hash)).toBe(false);

  });

});



describe("extractSlugFromInput", () => {

  it("extracts slug from full URLs or raw slugs and rejects invalid strings", () => {

    expect(

      extractSlugFromInput("https://triphub.bd/trips/AbCdEfGhIjKlMnOpQrStUv"),

    ).toBe("AbCdEfGhIjKlMnOpQrStUv");

    expect(

      extractSlugFromInput(

        "http://localhost:3000/trips/AbCdEfGhIjKlMnOpQrStUv?ref=wa",

      ),

    ).toBe("AbCdEfGhIjKlMnOpQrStUv");

    expect(extractSlugFromInput("  AbCdEfGhIjKlMnOpQrStUv  ")).toBe(

      "AbCdEfGhIjKlMnOpQrStUv",

    );

    expect(extractSlugFromInput("short")).toBeNull();

    expect(extractSlugFromInput("")).toBeNull();

  });

});

EOF



cat > "${PROJECT_DIR}/src/messages/bn.json" <<'EOF'

{

  "app": {

    "name": "ট্রিপ হাব",

    "tagline": "বন্ধুদের সাথে ভ্রমণ পরিকল্পনা ও খরচের সহজ হিসাব",

    "createTrip": "নতুন ট্রিপ তৈরি করুন",

    "joinTrip": "ট্রিপে যোগ দিন",

    "comingSoon": "শীঘ্রই আসছে",

    "footer": "বাংলাদেশের ভ্রমণপ্রেমী বন্ধুদের জন্য তৈরি • হিসাব সবসময় পূর্ণ টাকায় (৳)"

  },

  "header": {

    "languageLabelBn": "বাংলা",

    "languageLabelEn": "English",

    "switchLanguageAria": "ভাষা পরিবর্তন করুন"

  },

  "createTrip": {

    "title": "নতুন ট্রিপ তৈরি করুন",

    "subtitle": "ট্রিপের নাম ও আপনার নাম দিন, তারপর বন্ধুদের লিংক পাঠান",

    "tripNameLabel": "ট্রিপের নাম *",

    "tripNamePlaceholder": "যেমন: সুন্দরবন ট্যুর ২০২৬",

    "destinationLabel": "গন্তব্য (ঐচ্ছিক)",

    "destinationPlaceholder": "যেমন: কক্সবাজার / শ্রীমঙ্গল",

    "startDateLabel": "শুরুর তারিখ (ঐচ্ছিক)",

    "endDateLabel": "শেষের তারিখ (ঐচ্ছিক)",

    "yourNameLabel": "আপনার নাম (ট্রিপ ক্রিয়েটর) *",

    "yourNamePlaceholder": "যেমন: করিম",

    "emojiLabel": "আপনার ইমোজি চিহ্ন",

    "pinLabel": "৪-৬ সংখ্যার পিন (ঐচ্ছিক)",

    "pinHint": "ফোন বদলালে বা ব্রাউজার ক্লিয়ার হলে নাম ফিরে পেতে কাজে লাগবে",

    "submitButton": "ট্রিপ শুরু করুন",

    "backHome": "← হোমে ফিরে যান"

  },

  "joinByLink": {

    "title": "ট্রিপে যোগ দিন",

    "subtitle": "বন্ধুর পাঠানো ট্রিপ লিংক বা কোড নিচে পেস্ট করুন",

    "inputLabel": "ট্রিপ লিংক বা স্লাগ কোড *",

    "inputPlaceholder": "https://.../trips/AbCdEf... অথবা কোড",

    "submitButton": "ট্রিপ খুঁজুন",

    "backHome": "← হোমে ফিরে যান"

  },

  "whoAreYou": {

    "title": "আপনি কে?",

    "subtitle": "এই ট্রিপে যোগ দিতে নিজের নাম বেছে নিন বা নতুন নাম লিখুন",

    "reclaimTitle": "আগে থেকেই এই ট্রিপে আছেন? নিজের নামে ট্যাপ করুন",

    "reclaimButton": "এই নামে প্রবেশ করুন",

    "pinProtected": "পিন দেওয়া আছে",

    "noPinSet": "পিন ছাড়া এক ট্যাপে প্রবেশ",

    "enterPinPlaceholder": "৪-৬ সংখ্যার পিন দিন",

    "newMemberTitle": "নতুন সদস্য হিসেবে যোগ দিন",

    "yourNameLabel": "আপনার নাম *",

    "yourNamePlaceholder": "যেমন: তানভীর",

    "emojiLabel": "ইমোজি চিহ্ন (একই নামের বন্ধু আলাদা করতে)",

    "pinLabel": "৪-৬ সংখ্যার পিন (ঐচ্ছিক)",

    "pinPlaceholder": "যেমন: ১২৩৪",

    "joinButton": "ট্রিপে যোগ দিন",

    "lockedNotice": "এই ট্রিপটি লক করা আছে। নতুন সদস্য যোগ হতে পারবে না, তবে পুরনো সদস্যরা নিজের নাম সিলেক্ট করে দেখতে পারবেন।"

  },

  "tripPage": {

    "shareTitle": "বন্ধুদের আমন্ত্রণ জানান",

    "shareSubtitle": "এই লিংকটি হোয়াটসঅ্যাপ বা মেসেঞ্জারে শেয়ার করুন (লগইন লাগবে না)",

    "copyLink": "লিংক কপি করুন",

    "copied": "কপি হয়েছে!",

    "shareNative": "শেয়ার করুন",

    "signedInAs": "আপনি যুক্ত আছেন:",

    "switchDevice": "নাম পরিবর্তন / রিক্লেইম টেস্ট করুন",

    "lockedBadge": "🔒 ট্রিপ লকড",

    "unlockedBadge": "🔓 ট্রিপ চালু",

    "destinationPrefix": "গন্তব্য:",

    "membersHeading": "ট্রিপের সদস্যবৃন্দ",

    "creatorBadge": "ক্রিয়েটর",

    "guestBadge": "গেস্ট",

    "pinSetBadge": "পিন সেট",

    "creatorControlsTitle": "ক্রিয়েটর কন্ট্রোলস",

    "addGuestTitle": "গেস্ট সদস্য যোগ করুন (যার অ্যাপ নেই)",

    "guestNamePlaceholder": "গেস্টের নাম",

    "addGuestButton": "গেস্ট যোগ করুন",

    "renameTitle": "সদস্যের নাম বা ইমোজি পরিবর্তন করুন",

    "renameSaveButton": "আপডেট করুন",

    "lockTripButton": "ট্রিপ লক করুন",

    "unlockTripButton": "ট্রিপ আনলক করুন",

    "lockTripHint": "লক করলে কেউ নতুন করে যোগ হতে বা তথ্য বদলাতে পারবে না।",

    "nextStepsTitle": "খরচের হিসাব, গন্তব্য ভোট ও প্ল্যান",

    "nextStepsBody": "ধাপ ৩-৫ এ খরচের হিসাব ও ভাগ-বাটোয়ারা যুক্ত হবে।"

  },

  "errors": {

    "invalid_input": "তথ্যগুলো সঠিকভাবে পূরণ করুন।",

    "invalid_pin": "পিন অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।",

    "wrong_pin": "পিনটি সঠিক নয়। আবার চেষ্টা করুন।",

    "duplicate_name": "এই নামে একজন সদস্য ইতিমধ্যে আছেন! নিচের তালিকা থেকে নামটি বেছে নিন অথবা নামের সাথে ডাকনাম/ইনিশিয়াল যোগ করুন।",

    "trip_not_found": "এই লিংকে কোনো ট্রিপ পাওয়া যায়নি।",

    "trip_locked": "ট্রিপটি লক করা আছে, তাই পরিবর্তন করা যাবে না।",

    "not_creator": "শুধুমাত্র ট্রিপ ক্রিয়েটর এই কাজটি করতে পারবেন।"

  }

}

EOF



cat > "${PROJECT_DIR}/src/messages/en.json" <<'EOF'

{

  "app": {

    "name": "Trip Hub",

    "tagline": "Plan group trips and split expenses with friends effortlessly",

    "createTrip": "Create a trip",

    "joinTrip": "Join a trip",

    "comingSoon": "Coming soon",

    "footer": "Built for friend groups in Bangladesh • All amounts in whole BDT (৳)"

  },

  "header": {

    "languageLabelBn": "বাংলা",

    "languageLabelEn": "English",

    "switchLanguageAria": "Switch language"

  },

  "createTrip": {

    "title": "Create a new trip",

    "subtitle": "Enter the trip name and your name, then share the link with friends",

    "tripNameLabel": "Trip name *",

    "tripNamePlaceholder": "e.g., Sundarbans Tour 2026",

    "destinationLabel": "Destination (optional)",

    "destinationPlaceholder": "e.g., Cox's Bazar / Sreemangal",

    "startDateLabel": "Start date (optional)",

    "endDateLabel": "End date (optional)",

    "yourNameLabel": "Your name (Trip creator) *",

    "yourNamePlaceholder": "e.g., Karim",

    "emojiLabel": "Your emoji tag",

    "pinLabel": "4–6 digit PIN (optional)",

    "pinHint": "Helps you reclaim your name if you clear browser data or switch phones",

    "submitButton": "Start trip",

    "backHome": "← Back to home"

  },

  "joinByLink": {

    "title": "Join a trip",

    "subtitle": "Paste the shared trip link or slug code from your friend below",

    "inputLabel": "Trip link or slug code *",

    "inputPlaceholder": "https://.../trips/AbCdEf... or code",

    "submitButton": "Find trip",

    "backHome": "← Back to home"

  },

  "whoAreYou": {

    "title": "Who are you?",

    "subtitle": "Pick your existing name or join as a new member on this trip",

    "reclaimTitle": "Already on this trip? Tap your name to rejoin",

    "reclaimButton": "Continue as this member",

    "pinProtected": "PIN protected",

    "noPinSet": "One-tap rejoin (no PIN)",

    "enterPinPlaceholder": "Enter 4–6 digit PIN",

    "newMemberTitle": "Join as a new member",

    "yourNameLabel": "Your name *",

    "yourNamePlaceholder": "e.g., Tanvir",

    "emojiLabel": "Emoji tag (helps tell same-named friends apart)",

    "pinLabel": "4–6 digit PIN (optional)",

    "pinPlaceholder": "e.g., 1234",

    "joinButton": "Join trip",

    "lockedNotice": "This trip is locked. New members cannot join, but existing members can still reclaim their name above."

  },

  "tripPage": {

    "shareTitle": "Invite your friends",

    "shareSubtitle": "Share this link on WhatsApp or Messenger (no login needed)",

    "copyLink": "Copy link",

    "copied": "Copied!",

    "shareNative": "Share link",

    "signedInAs": "Signed in as:",

    "switchDevice": "Switch member / Test reclaim",

    "lockedBadge": "🔒 Trip Locked",

    "unlockedBadge": "🔓 Active",

    "destinationPrefix": "Destination:",

    "membersHeading": "Trip Members",

    "creatorBadge": "Creator",

    "guestBadge": "Guest",

    "pinSetBadge": "PIN set",

    "creatorControlsTitle": "Creator Controls",

    "addGuestTitle": "Add a guest member (friend without the app)",

    "guestNamePlaceholder": "Guest display name",

    "addGuestButton": "Add guest",

    "renameTitle": "Rename or update emoji for a member",

    "renameSaveButton": "Save changes",

    "lockTripButton": "Lock trip",

    "unlockTripButton": "Unlock trip",

    "lockTripHint": "Locking prevents new members, guests, or edits.",

    "nextStepsTitle": "Expenses, Destination Voting & Itinerary",

    "nextStepsBody": "Expense splitting, destination voting, and itinerary come in Steps 3–5."

  },

  "errors": {

    "invalid_input": "Please fill in the required fields properly.",

    "invalid_pin": "PIN must be 4 to 6 digits.",

    "wrong_pin": "Incorrect PIN. Please try again.",

    "duplicate_name": "Someone with this name is already on the trip! Reclaim your name from the list above or add a last initial.",

    "trip_not_found": "No trip was found for that link or code.",

    "trip_locked": "This trip is locked and cannot be modified.",

    "not_creator": "Only the trip creator can perform this action."

  }

}

EOF



cat > "${PROJECT_DIR}/src/components/ShareLinkCard.tsx" <<'EOF'

"use client";



import { useState } from "react";



interface ShareLinkCardProps {

  slug: string;

  tripName: string;

  shareTitle: string;

  shareSubtitle: string;

  copyLabel: string;

  copiedLabel: string;

  shareNativeLabel: string;

}



export function ShareLinkCard({

  slug,

  tripName,

  shareTitle,

  shareSubtitle,

  copyLabel,

  copiedLabel,

  shareNativeLabel,

}: ShareLinkCardProps) {

  const [copied, setCopied] = useState(false);

  const relativePath = `/trips/${slug}`;



  function getFullUrl(): string {

    if (typeof window === "undefined") {

      return relativePath;

    }

    return `${window.location.origin}${relativePath}`;

  }



  async function handleCopy(): Promise<void> {

    try {

      await navigator.clipboard.writeText(getFullUrl());

      setCopied(true);

      window.setTimeout(() => setCopied(false), 2000);

    } catch {

      // Fallback if clipboard permission denied

    }

  }



  async function handleNativeShare(): Promise<void> {

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {

      try {

        await navigator.share({

          title: tripName,

          url: getFullUrl(),

        });

      } catch {

        // User cancelled share sheet

      }

    } else {

      await handleCopy();

    }

  }



  return (

    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

      <div className="space-y-1">

        <h2 className="text-base font-bold text-[var(--color-fg)]">

          {shareTitle}

        </h2>

        <p className="text-sm text-[var(--color-fg-muted)]">{shareSubtitle}</p>

      </div>



      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 font-mono text-sm text-[var(--color-fg)]">

        {relativePath}

      </div>



      <div className="grid grid-cols-2 gap-2.5">

        <button

          type="button"

          onClick={handleCopy}

          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base font-semibold text-[var(--color-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-muted)]"

        >

          {copied ? copiedLabel : copyLabel}

        </button>



        <button

          type="button"

          onClick={handleNativeShare}

          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--color-primary)] px-3 py-2 text-base font-semibold text-[var(--color-primary-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-primary-hover)]"

        >

          {shareNativeLabel}

        </button>

      </div>

    </div>

  );

}

EOF



cat > "${PROJECT_DIR}/src/app/page.tsx" <<'EOF'

import Link from "next/link";

import { getTranslations } from "next-intl/server";



export default async function HomePage() {

  const t = await getTranslations("app");



  return (

    <section className="my-auto flex flex-col justify-center gap-6 py-8">

      <div className="space-y-2 text-center">

        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg)]">

          {t("name")}

        </h1>

        <p className="text-base text-[var(--color-fg-muted)]">

          {t("tagline")}

        </p>

      </div>



      <div className="flex flex-col gap-3 pt-2">

        <Link

          href="/trips/new"

          className="inline-flex min-h-[48px] min-w-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-semibold text-[var(--color-primary-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"

        >

          {t("createTrip")}

        </Link>



        <Link

          href="/trips/join"

          className="inline-flex min-h-[48px] min-w-[44px] w-full items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-base font-semibold text-[var(--color-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"

        >

          {t("joinTrip")}

        </Link>

      </div>

    </section>

  );

}

EOF



cat > "${PROJECT_DIR}/src/app/trips/actions.ts" <<'EOF'

"use server";



import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import {

  extractSlugFromInput,

  generateTripSlug,

  hashPin,

  normalizeNameKey,

  verifyPin,

} from "@/lib/crypto";

import { db } from "@/lib/db";

import {

  clearMemberDeviceSession,

  createMemberDeviceSession,

  getCurrentMemberForTrip,

} from "@/lib/session";

import {

  addGuestFormSchema,

  createTripFormSchema,

  joinTripFormSchema,

  reclaimMemberFormSchema,

  renameMemberFormSchema,

} from "@/lib/trips";



function parseOptionalDhakaDate(yyyyMmDd: string | undefined): Date | null {

  if (!yyyyMmDd) {

    return null;

  }

  return new Date(`${yyyyMmDd}T00:00:00+06:00`);

}



export async function createTripAction(formData: FormData): Promise<void> {

  const parsed = createTripFormSchema.safeParse({

    name: formData.get("name") ?? "",

    destination: formData.get("destination") ?? undefined,

    startDate: formData.get("startDate") ?? undefined,

    endDate: formData.get("endDate") ?? undefined,

    creatorName: formData.get("creatorName") ?? "",

    creatorEmoji: formData.get("creatorEmoji") ?? "🎒",

    creatorPin: formData.get("creatorPin") ?? undefined,

  });



  if (!parsed.success) {

    const hasPinErr = parsed.error.issues.some(

      (i) => i.message === "invalid_pin",

    );

    const code = hasPinErr ? "invalid_pin" : "invalid_input";

    redirect(`/trips/new?error=${code}`);

  }



  const {

    name,

    destination,

    startDate,

    endDate,

    creatorName,

    creatorEmoji,

    creatorPin,

  } = parsed.data;



  const slug = generateTripSlug();

  const nameKey = normalizeNameKey(creatorName);

  const pinHash = creatorPin ? hashPin(creatorPin) : null;



  const result = await db.$transaction(async (tx) => {

    const trip = await tx.trip.create({

      data: {

        slug,

        name,

        destination: destination ?? null,

        startDate: parseOptionalDhakaDate(startDate),

        endDate: parseOptionalDhakaDate(endDate),

      },

    });



    const creator = await tx.member.create({

      data: {

        tripId: trip.id,

        displayName: creatorName.trim(),

        nameKey,

        emoji: creatorEmoji,

        isGuest: false,

        pinHash,

      },

    });



    const updatedTrip = await tx.trip.update({

      where: { id: trip.id },

      data: { creatorMemberId: creator.id },

    });



    await tx.activityLog.create({

      data: {

        tripId: trip.id,

        memberId: creator.id,

        entityType: "trip",

        entityId: trip.id,

        action: "create",

        after: {

          name: updatedTrip.name,

          destination: updatedTrip.destination,

          creatorDisplayName: creator.displayName,

        },

      },

    });



    return { trip: updatedTrip, creator };

  });



  await createMemberDeviceSession(result.creator.id, result.trip.id);

  redirect(`/trips/${result.trip.slug}`);

}



export async function lookupTripByLinkAction(

  formData: FormData,

): Promise<void> {

  const raw = String(formData.get("tripLinkOrSlug") ?? "");

  const slug = extractSlugFromInput(raw);



  if (!slug) {

    redirect("/trips/join?error=trip_not_found");

  }



  const trip = await db.trip.findUnique({

    where: { slug },

    select: { slug: true },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  redirect(`/trips/${trip.slug}`);

}



export async function joinTripAction(formData: FormData): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const parsed = joinTripFormSchema.safeParse({

    slug,

    displayName: formData.get("displayName") ?? "",

    emoji: formData.get("emoji") ?? "🎒",

    pin: formData.get("pin") ?? undefined,

  });



  if (!parsed.success) {

    const hasPinErr = parsed.error.issues.some(

      (i) => i.message === "invalid_pin",

    );

    const code = hasPinErr ? "invalid_pin" : "invalid_input";

    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);

  }



  const trip = await db.trip.findUnique({

    where: { slug: parsed.data.slug },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  if (trip.lockedAt) {

    redirect(`/trips/${trip.slug}?error=trip_locked`);

  }



  const displayName = parsed.data.displayName.trim();

  const nameKey = normalizeNameKey(displayName);

  const existing = await db.member.findUnique({

    where: {

      tripId_nameKey: {

        tripId: trip.id,

        nameKey,

      },

    },

  });



  if (existing) {

    redirect(`/trips/${trip.slug}?error=duplicate_name`);

  }



  const pinHash = parsed.data.pin ? hashPin(parsed.data.pin) : null;



  const member = await db.$transaction(async (tx) => {

    const created = await tx.member.create({

      data: {

        tripId: trip.id,

        displayName,

        nameKey,

        emoji: parsed.data.emoji,

        isGuest: false,

        pinHash,

      },

    });



    await tx.activityLog.create({

      data: {

        tripId: trip.id,

        memberId: created.id,

        entityType: "member",

        entityId: created.id,

        action: "join",

        after: {

          displayName: created.displayName,

          emoji: created.emoji,

        },

      },

    });



    return created;

  });



  await createMemberDeviceSession(member.id, trip.id);

  revalidatePath(`/trips/${trip.slug}`);

  redirect(`/trips/${trip.slug}`);

}



export async function reclaimMemberAction(formData: FormData): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const parsed = reclaimMemberFormSchema.safeParse({

    slug,

    memberId: formData.get("memberId") ?? "",

    pin: formData.get("pin") ?? undefined,

  });



  if (!parsed.success) {

    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);

  }



  const trip = await db.trip.findUnique({

    where: { slug: parsed.data.slug },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  const member = await db.member.findUnique({

    where: { id: parsed.data.memberId },

  });



  if (!member || member.tripId !== trip.id || member.isGuest) {

    redirect(`/trips/${trip.slug}?error=invalid_input`);

  }



  if (member.pinHash) {

    if (!parsed.data.pin || !verifyPin(parsed.data.pin, member.pinHash)) {

      redirect(`/trips/${trip.slug}?error=wrong_pin`);

    }

  }



  await createMemberDeviceSession(member.id, trip.id);

  revalidatePath(`/trips/${trip.slug}`);

  redirect(`/trips/${trip.slug}`);

}



export async function switchDeviceMemberAction(

  formData: FormData,

): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const trip = await db.trip.findUnique({

    where: { slug },

    select: { id: true, slug: true },

  });



  if (trip) {

    await clearMemberDeviceSession(trip.id);

    revalidatePath(`/trips/${trip.slug}`);

    redirect(`/trips/${trip.slug}`);

  }



  redirect("/");

}



export async function addGuestMemberAction(formData: FormData): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const parsed = addGuestFormSchema.safeParse({

    slug,

    displayName: formData.get("displayName") ?? "",

    emoji: formData.get("emoji") ?? "👤",

  });



  if (!parsed.success) {

    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);

  }



  const trip = await db.trip.findUnique({

    where: { slug: parsed.data.slug },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  if (trip.lockedAt) {

    redirect(`/trips/${trip.slug}?error=trip_locked`);

  }



  const currentMember = await getCurrentMemberForTrip(trip.id);

  if (!currentMember || currentMember.id !== trip.creatorMemberId) {

    redirect(`/trips/${trip.slug}?error=not_creator`);

  }



  const displayName = parsed.data.displayName.trim();

  const nameKey = normalizeNameKey(displayName);



  const existing = await db.member.findUnique({

    where: {

      tripId_nameKey: {

        tripId: trip.id,

        nameKey,

      },

    },

  });



  if (existing) {

    redirect(`/trips/${trip.slug}?error=duplicate_name`);

  }



  await db.$transaction(async (tx) => {

    const guest = await tx.member.create({

      data: {

        tripId: trip.id,

        displayName,

        nameKey,

        emoji: parsed.data.emoji,

        isGuest: true,

      },

    });



    await tx.activityLog.create({

      data: {

        tripId: trip.id,

        memberId: currentMember.id,

        entityType: "member",

        entityId: guest.id,

        action: "create_guest",

        after: {

          displayName: guest.displayName,

          emoji: guest.emoji,

          isGuest: true,

        },

      },

    });

  });



  revalidatePath(`/trips/${trip.slug}`);

  redirect(`/trips/${trip.slug}`);

}



export async function renameMemberAction(formData: FormData): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const parsed = renameMemberFormSchema.safeParse({

    slug,

    memberId: formData.get("memberId") ?? "",

    displayName: formData.get("displayName") ?? "",

    emoji: formData.get("emoji") ?? "🎒",

  });



  if (!parsed.success) {

    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);

  }



  const trip = await db.trip.findUnique({

    where: { slug: parsed.data.slug },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  if (trip.lockedAt) {

    redirect(`/trips/${trip.slug}?error=trip_locked`);

  }



  const currentMember = await getCurrentMemberForTrip(trip.id);

  if (!currentMember || currentMember.id !== trip.creatorMemberId) {

    redirect(`/trips/${trip.slug}?error=not_creator`);

  }



  const targetMember = await db.member.findUnique({

    where: { id: parsed.data.memberId },

  });



  if (!targetMember || targetMember.tripId !== trip.id) {

    redirect(`/trips/${trip.slug}?error=invalid_input`);

  }



  const displayName = parsed.data.displayName.trim();

  const nameKey = normalizeNameKey(displayName);



  const duplicate = await db.member.findUnique({

    where: {

      tripId_nameKey: {

        tripId: trip.id,

        nameKey,

      },

    },

  });



  if (duplicate && duplicate.id !== targetMember.id) {

    redirect(`/trips/${trip.slug}?error=duplicate_name`);

  }



  await db.$transaction(async (tx) => {

    const updated = await tx.member.update({

      where: { id: targetMember.id },

      data: {

        displayName,

        nameKey,

        emoji: parsed.data.emoji,

      },

    });



    await tx.activityLog.create({

      data: {

        tripId: trip.id,

        memberId: currentMember.id,

        entityType: "member",

        entityId: targetMember.id,

        action: "update",

        before: {

          displayName: targetMember.displayName,

          emoji: targetMember.emoji,

        },

        after: {

          displayName: updated.displayName,

          emoji: updated.emoji,

        },

      },

    });

  });



  revalidatePath(`/trips/${trip.slug}`);

  redirect(`/trips/${trip.slug}`);

}



export async function toggleTripLockAction(formData: FormData): Promise<void> {

  const slug = String(formData.get("slug") ?? "").trim();

  const trip = await db.trip.findUnique({

    where: { slug },

  });



  if (!trip) {

    redirect("/trips/join?error=trip_not_found");

  }



  const currentMember = await getCurrentMemberForTrip(trip.id);

  if (!currentMember || currentMember.id !== trip.creatorMemberId) {

    redirect(`/trips/${trip.slug}?error=not_creator`);

  }



  const nextLockedAt = trip.lockedAt ? null : new Date();



  await db.$transaction(async (tx) => {

    await tx.trip.update({

      where: { id: trip.id },

      data: { lockedAt: nextLockedAt },

    });



    await tx.activityLog.create({

      data: {

        tripId: trip.id,

        memberId: currentMember.id,

        entityType: "trip",

        entityId: trip.id,

        action: nextLockedAt ? "lock" : "unlock",

        before: { lockedAt: trip.lockedAt?.toISOString() ?? null },

        after: { lockedAt: nextLockedAt?.toISOString() ?? null },

      },

    });

  });



  revalidatePath(`/trips/${trip.slug}`);

  redirect(`/trips/${trip.slug}`);

}

EOF



cat > "${PROJECT_DIR}/src/app/trips/new/page.tsx" <<'EOF'

import Link from "next/link";

import { getTranslations } from "next-intl/server";

import { createTripAction } from "@/app/trips/actions";

import { Button } from "@/components/Button";

import { MEMBER_EMOJIS } from "@/lib/trips";



interface NewTripPageProps {

  searchParams: Promise<{ error?: string }>;

}



export default async function NewTripPage({ searchParams }: NewTripPageProps) {

  const { error } = await searchParams;

  const t = await getTranslations("createTrip");

  const tErr = await getTranslations("errors");



  const errorMessage =

    error === "invalid_pin"

      ? tErr("invalid_pin")

      : error

        ? tErr("invalid_input")

        : null;



  return (

    <section className="space-y-5 py-2">

      <div>

        <Link

          href="/"

          className="inline-flex min-h-[44px] items-center text-base font-medium text-[var(--color-primary)] hover:underline"

        >

          {t("backHome")}

        </Link>

        <h1 className="mt-1 text-2xl font-bold text-[var(--color-fg)]">

          {t("title")}

        </h1>

        <p className="text-base text-[var(--color-fg-muted)]">

          {t("subtitle")}

        </p>

      </div>



      {errorMessage ? (

        <div

          role="alert"

          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"

        >

          {errorMessage}

        </div>

      ) : null}



      <form

        action={createTripAction}

        className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"

      >

        <div className="space-y-1.5">

          <label

            htmlFor="name"

            className="block text-base font-semibold text-[var(--color-fg)]"

          >

            {t("tripNameLabel")}

          </label>

          <input

            id="name"

            name="name"

            type="text"

            required

            minLength={2}

            maxLength={80}

            placeholder={t("tripNamePlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

          />

        </div>



        <div className="space-y-1.5">

          <label

            htmlFor="destination"

            className="block text-base font-semibold text-[var(--color-fg)]"

          >

            {t("destinationLabel")}

          </label>

          <input

            id="destination"

            name="destination"

            type="text"

            maxLength={80}

            placeholder={t("destinationPlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

          />

        </div>



        <div className="grid grid-cols-2 gap-3">

          <div className="space-y-1.5">

            <label

              htmlFor="startDate"

              className="block text-sm font-semibold text-[var(--color-fg)]"

            >

              {t("startDateLabel")}

            </label>

            <input

              id="startDate"

              name="startDate"

              type="date"

              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

            />

          </div>



          <div className="space-y-1.5">

            <label

              htmlFor="endDate"

              className="block text-sm font-semibold text-[var(--color-fg)]"

            >

              {t("endDateLabel")}

            </label>

            <input

              id="endDate"

              name="endDate"

              type="date"

              className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

            />

          </div>

        </div>



        <hr className="border-[var(--color-border)]" />



        <div className="space-y-1.5">

          <label

            htmlFor="creatorName"

            className="block text-base font-semibold text-[var(--color-fg)]"

          >

            {t("yourNameLabel")}

          </label>

          <input

            id="creatorName"

            name="creatorName"

            type="text"

            required

            minLength={1}

            maxLength={40}

            placeholder={t("yourNamePlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

          />

        </div>



        <fieldset className="space-y-1.5">

          <legend className="text-base font-semibold text-[var(--color-fg)]">

            {t("emojiLabel")}

          </legend>

          <div className="grid grid-cols-6 gap-2 pt-1">

            {MEMBER_EMOJIS.map((emoji, index) => (

              <label

                key={emoji}

                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl has-[:checked]:border-2 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-white"

              >

                <input

                  type="radio"

                  name="creatorEmoji"

                  value={emoji}

                  defaultChecked={index === 0}

                  className="sr-only"

                />

                <span>{emoji}</span>

              </label>

            ))}

          </div>

        </fieldset>



        <div className="space-y-1">

          <label

            htmlFor="creatorPin"

            className="block text-base font-semibold text-[var(--color-fg)]"

          >

            {t("pinLabel")}

          </label>

          <input

            id="creatorPin"

            name="creatorPin"

            type="password"

            inputMode="numeric"

            maxLength={6}

            placeholder="১২৩৪ / 1234"

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

          />

          <p className="text-sm text-[var(--color-fg-muted)]">{t("pinHint")}</p>

        </div>



        <Button type="submit" variant="primary">

          {t("submitButton")}

        </Button>

      </form>

    </section>

  );

}

EOF



cat > "${PROJECT_DIR}/src/app/trips/join/page.tsx" <<'EOF'

import Link from "next/link";

import { getTranslations } from "next-intl/server";

import { lookupTripByLinkAction } from "@/app/trips/actions";

import { Button } from "@/components/Button";



interface JoinTripByLinkPageProps {

  searchParams: Promise<{ error?: string }>;

}



export default async function JoinTripByLinkPage({

  searchParams,

}: JoinTripByLinkPageProps) {

  const { error } = await searchParams;

  const t = await getTranslations("joinByLink");

  const tErr = await getTranslations("errors");



  return (

    <section className="space-y-5 py-2">

      <div>

        <Link

          href="/"

          className="inline-flex min-h-[44px] items-center text-base font-medium text-[var(--color-primary)] hover:underline"

        >

          {t("backHome")}

        </Link>

        <h1 className="mt-1 text-2xl font-bold text-[var(--color-fg)]">

          {t("title")}

        </h1>

        <p className="text-base text-[var(--color-fg-muted)]">

          {t("subtitle")}

        </p>

      </div>



      {error ? (

        <div

          role="alert"

          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"

        >

          {tErr("trip_not_found")}

        </div>

      ) : null}



      <form

        action={lookupTripByLinkAction}

        className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"

      >

        <div className="space-y-1.5">

          <label

            htmlFor="tripLinkOrSlug"

            className="block text-base font-semibold text-[var(--color-fg)]"

          >

            {t("inputLabel")}

          </label>

          <input

            id="tripLinkOrSlug"

            name="tripLinkOrSlug"

            type="text"

            required

            placeholder={t("inputPlaceholder")}

            className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

          />

        </div>



        <Button type="submit" variant="primary">

          {t("submitButton")}

        </Button>

      </form>

    </section>

  );

}

EOF



cat > "${PROJECT_DIR}/src/app/trips/[slug]/page.tsx" <<'EOF'

import { notFound } from "next/navigation";

import { getLocale, getTranslations } from "next-intl/server";

import {

  addGuestMemberAction,

  joinTripAction,

  reclaimMemberAction,

  renameMemberAction,

  switchDeviceMemberAction,

  toggleTripLockAction,

} from "@/app/trips/actions";

import { Button } from "@/components/Button";

import { ShareLinkCard } from "@/components/ShareLinkCard";

import { db } from "@/lib/db";

import {

  formatDate,

  type SupportedLocale,

  toBanglaDigits,

} from "@/lib/format";

import { getCurrentMemberForTrip } from "@/lib/session";

import { MEMBER_EMOJIS } from "@/lib/trips";



interface TripPageProps {

  params: Promise<{ slug: string }>;

  searchParams: Promise<{ error?: string }>;

}



const ERROR_KEYS = new Set([

  "invalid_input",

  "invalid_pin",

  "wrong_pin",

  "duplicate_name",

  "trip_not_found",

  "trip_locked",

  "not_creator",

]);



export default async function TripPage({

  params,

  searchParams,

}: TripPageProps) {

  const { slug } = await params;

  const { error } = await searchParams;

  const locale = (await getLocale()) as SupportedLocale;



  const trip = await db.trip.findUnique({

    where: { slug },

    include: {

      members: {

        orderBy: { createdAt: "asc" },

      },

    },

  });



  if (!trip) {

    notFound();

  }



  const currentMember = await getCurrentMemberForTrip(trip.id);

  const tWho = await getTranslations("whoAreYou");

  const tTrip = await getTranslations("tripPage");

  const tErr = await getTranslations("errors");



  const errorMessage =

    error && ERROR_KEYS.has(error)

      ? tErr(

          error as

            | "invalid_input"

            | "invalid_pin"

            | "wrong_pin"

            | "duplicate_name"

            | "trip_not_found"

            | "trip_locked"

            | "not_creator",

        )

      : null;



  const isLocked = Boolean(trip.lockedAt);

  const reclaimableMembers = trip.members.filter((m) => !m.isGuest);



  // 1. If device has no active session for this trip, show the "Who are you?" screen

  if (!currentMember) {

    return (

      <section className="space-y-6 py-2">

        <div className="space-y-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

          <div className="flex items-center justify-between gap-2">

            <h1 className="text-2xl font-bold text-[var(--color-fg)]">

              {trip.name}

            </h1>

            <span className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg-muted)]">

              {isLocked ? tTrip("lockedBadge") : tTrip("unlockedBadge")}

            </span>

          </div>

          {trip.destination ? (

            <p className="text-base text-[var(--color-fg-muted)]">

              {tTrip("destinationPrefix")} {trip.destination}

            </p>

          ) : null}

        </div>



        {errorMessage ? (

          <div

            role="alert"

            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"

          >

            {errorMessage}

          </div>

        ) : null}



        <div className="space-y-1">

          <h2 className="text-xl font-bold text-[var(--color-fg)]">

            {tWho("title")}

          </h2>

          <p className="text-base text-[var(--color-fg-muted)]">

            {tWho("subtitle")}

          </p>

        </div>



        {/* Reclaim existing member section */}

        {reclaimableMembers.length > 0 ? (

          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

            <h3 className="text-base font-semibold text-[var(--color-fg)]">

              {tWho("reclaimTitle")}

            </h3>



            <div className="space-y-2.5">

              {reclaimableMembers.map((member) => {

                const hasPin = Boolean(member.pinHash);

                return (

                  <form

                    key={member.id}

                    action={reclaimMemberAction}

                    className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"

                  >

                    <input type="hidden" name="slug" value={trip.slug} />

                    <input type="hidden" name="memberId" value={member.id} />



                    <div className="flex items-center justify-between gap-2">

                      <div className="flex items-center gap-2 font-semibold text-[var(--color-fg)]">

                        <span className="text-xl">{member.emoji ?? "🎒"}</span>

                        <span>{member.displayName}</span>

                        {member.id === trip.creatorMemberId ? (

                          <span className="rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">

                            {tTrip("creatorBadge")}

                          </span>

                        ) : null}

                      </div>

                      <span className="text-xs font-medium text-[var(--color-fg-muted)]">

                        {hasPin ? `🔒 ${tWho("pinProtected")}` : tWho("noPinSet")}

                      </span>

                    </div>



                    {hasPin ? (

                      <div className="flex gap-2">

                        <input

                          name="pin"

                          type="password"

                          inputMode="numeric"

                          required

                          maxLength={6}

                          placeholder={tWho("enterPinPlaceholder")}

                          className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

                        />

                        <button

                          type="submit"

                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"

                        >

                          {tWho("reclaimButton")}

                        </button>

                      </div>

                    ) : (

                      <button

                        type="submit"

                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"

                      >

                        {tWho("reclaimButton")}

                      </button>

                    )}

                  </form>

                );

              })}

            </div>

          </div>

        ) : null}



        {/* Join as a new member section */}

        <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

          <h3 className="text-base font-semibold text-[var(--color-fg)]">

            {tWho("newMemberTitle")}

          </h3>



          {isLocked ? (

            <p className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-base text-[var(--color-fg-muted)]">

              {tWho("lockedNotice")}

            </p>

          ) : (

            <form action={joinTripAction} className="space-y-4">

              <input type="hidden" name="slug" value={trip.slug} />



              <div className="space-y-1.5">

                <label

                  htmlFor="displayName"

                  className="block text-base font-semibold text-[var(--color-fg)]"

                >

                  {tWho("yourNameLabel")}

                </label>

                <input

                  id="displayName"

                  name="displayName"

                  type="text"

                  required

                  minLength={1}

                  maxLength={40}

                  placeholder={tWho("yourNamePlaceholder")}

                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

                />

              </div>



              <fieldset className="space-y-1.5">

                <legend className="text-base font-semibold text-[var(--color-fg)]">

                  {tWho("emojiLabel")}

                </legend>

                <div className="grid grid-cols-6 gap-2 pt-1">

                  {MEMBER_EMOJIS.map((emoji, index) => (

                    <label

                      key={emoji}

                      className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xl has-[:checked]:border-2 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-white"

                    >

                      <input

                        type="radio"

                        name="emoji"

                        value={emoji}

                        defaultChecked={index === 0}

                        className="sr-only"

                      />

                      <span>{emoji}</span>

                    </label>

                  ))}

                </div>

              </fieldset>



              <div className="space-y-1.5">

                <label

                  htmlFor="pin"

                  className="block text-base font-semibold text-[var(--color-fg)]"

                >

                  {tWho("pinLabel")}

                </label>

                <input

                  id="pin"

                  name="pin"

                  type="password"

                  inputMode="numeric"

                  maxLength={6}

                  placeholder={tWho("pinPlaceholder")}

                  className="min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-base text-[var(--color-fg)] focus:border-[var(--color-primary)] focus:outline-none"

                />

              </div>



              <Button type="submit" variant="primary">

                {tWho("joinButton")}

              </Button>

            </form>

          )}

        </div>

      </section>

    );

  }



  // 2. Signed-in Trip Hub View

  const isCreator = currentMember.id === trip.creatorMemberId;

  const memberCountLabel =

    locale === "bn"

      ? toBanglaDigits(trip.members.length)

      : String(trip.members.length);



  return (

    <section className="space-y-5 py-2">

      {errorMessage ? (

        <div

          role="alert"

          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-900"

        >

          {errorMessage}

        </div>

      ) : null}



      {/* Trip header card */}

      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

        <div className="flex items-start justify-between gap-2">

          <div>

            <h1 className="text-2xl font-bold text-[var(--color-fg)]">

              {trip.name}

            </h1>

            {trip.destination ? (

              <p className="text-base text-[var(--color-fg-muted)]">

                {tTrip("destinationPrefix")} {trip.destination}

              </p>

            ) : null}

          </div>

          <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-fg-muted)]">

            {isLocked ? tTrip("lockedBadge") : tTrip("unlockedBadge")}

          </span>

        </div>



        {trip.startDate || trip.endDate ? (

          <p className="text-sm text-[var(--color-fg-muted)]">

            {trip.startDate ? formatDate(trip.startDate, locale) : ""}{" "}

            {trip.startDate && trip.endDate ? "—" : ""}{" "}

            {trip.endDate ? formatDate(trip.endDate, locale) : ""}

          </p>

        ) : null}



        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">

          <div className="flex items-center gap-2 text-base">

            <span className="text-[var(--color-fg-muted)]">

              {tTrip("signedInAs")}

            </span>

            <span className="font-bold text-[var(--color-fg)]">

              {currentMember.emoji ?? "🎒"} {currentMember.displayName}

            </span>

          </div>



          <form action={switchDeviceMemberAction}>

            <input type="hidden" name="slug" value={trip.slug} />

            <button

              type="submit"

              className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-border)]"

            >

              {tTrip("switchDevice")}

            </button>

          </form>

        </div>

      </div>



      {/* Shareable invite link card */}

      <ShareLinkCard

        slug={trip.slug}

        tripName={trip.name}

        shareTitle={tTrip("shareTitle")}

        shareSubtitle={tTrip("shareSubtitle")}

        copyLabel={tTrip("copyLink")}

        copiedLabel={tTrip("copied")}

        shareNativeLabel={tTrip("shareNative")}

      />



      {/* Members list */}

      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">

        <div className="flex items-center justify-between">

          <h2 className="text-lg font-bold text-[var(--color-fg)]">

            {tTrip("membersHeading")} ({memberCountLabel})

          </h2>

        </div>



        <ul className="divide-y divide-[var(--color-border)]">

          {trip.members.map((member) => (

            <li

              key={member.id}

              className="flex items-center justify-between gap-2 py-2.5"

            >

              <div className="flex items-center gap-2.5">

                <span className="text-xl">{member.emoji ?? "🎒"}</span>

                <span className="font-semibold text-[var(--color-fg)]">

                  {member.displayName}

                </span>

              </div>



              <div className="flex items-center gap-1.5">

                {member.id === trip.creatorMemberId ? (

                  <span className="rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">

                    {tTrip("creatorBadge")}

                  </span>

                ) : null}

                {member.isGuest ? (

                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">

                    {tTrip("guestBadge")}

                  </span>

                ) : null}

                {member.pinHash ? (

                  <span className="rounded-md bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]">

                    🔒 {tTrip("pinSetBadge")}

                  </span>

                ) : null}

              </div>

            </li>

          ))}

        </ul>

      </div>



      {/* Creator Controls (visible only to trip creator) */}

      {isCreator ? (

        <div className="space-y-5 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-4">

          <h2 className="text-lg font-bold text-[var(--color-primary)]">

            {tTrip("creatorControlsTitle")}

          </h2>



          {/* Add Guest Form */}

          {!isLocked ? (

            <form action={addGuestMemberAction} className="space-y-2.5">

              <input type="hidden" name="slug" value={trip.slug} />

              <label

                htmlFor="guestDisplayName"

                className="block text-sm font-semibold text-[var(--color-fg)]"

              >

                {tTrip("addGuestTitle")}

              </label>

              <div className="flex gap-2">

                <select

                  name="emoji"

                  aria-label="Guest emoji"

                  defaultValue="👤"

                  className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-white px-2 text-lg"

                >

                  <option value="👤">👤</option>

                  {MEMBER_EMOJIS.map((emoji) => (

                    <option key={emoji} value={emoji}>

                      {emoji}

                    </option>

                  ))}

                </select>

                <input

                  id="guestDisplayName"

                  name="displayName"

                  type="text"

                  required

                  maxLength={40}

                  placeholder={tTrip("guestNamePlaceholder")}

                  className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"

                />

                <button

                  type="submit"

                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-base font-semibold text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"

                >

                  {tTrip("addGuestButton")}

                </button>

              </div>

            </form>

          ) : null}



          {/* Rename / Update Emoji per Member */}

          {!isLocked ? (

            <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4">

              <h3 className="text-sm font-semibold text-[var(--color-fg)]">

                {tTrip("renameTitle")}

              </h3>

              <div className="space-y-2">

                {trip.members.map((member) => (

                  <form

                    key={member.id}

                    action={renameMemberAction}

                    className="flex items-center gap-2"

                  >

                    <input type="hidden" name="slug" value={trip.slug} />

                    <input type="hidden" name="memberId" value={member.id} />

                    <select

                      name="emoji"

                      aria-label={`Emoji for ${member.displayName}`}

                      defaultValue={member.emoji ?? "🎒"}

                      className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-white px-2 text-lg"

                    >

                      <option value="👤">👤</option>

                      {MEMBER_EMOJIS.map((emoji) => (

                        <option key={emoji} value={emoji}>

                          {emoji}

                        </option>

                      ))}

                    </select>

                    <input

                      name="displayName"

                      type="text"

                      required

                      maxLength={40}

                      defaultValue={member.displayName}

                      className="min-h-[44px] flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-fg)]"

                    />

                    <button

                      type="submit"

                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-border)]"

                    >

                      {tTrip("renameSaveButton")}

                    </button>

                  </form>

                ))}

              </div>

            </div>

          ) : null}



          {/* Lock / Unlock Trip Toggle */}

          <form

            action={toggleTripLockAction}

            className="space-y-2 border-t border-[var(--color-border)] pt-4"

          >

            <input type="hidden" name="slug" value={trip.slug} />

            <p className="text-sm text-[var(--color-fg-muted)]">

              {tTrip("lockTripHint")}

            </p>

            <Button

              type="submit"

              variant={isLocked ? "primary" : "secondary"}

            >

              {isLocked ? tTrip("unlockTripButton") : tTrip("lockTripButton")}

            </Button>

          </form>

        </div>

      ) : null}



      {/* Placeholder for Step 3–5 features */}

      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">

        <h3 className="text-base font-semibold text-[var(--color-fg)]">

          {tTrip("nextStepsTitle")}

        </h3>

        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">

          {tTrip("nextStepsBody")}

        </p>

      </div>

    </section>

  );

}

EOF



cat > "${PROJECT_DIR}/docs/STEP2-VERIFY.md" <<'EOF'

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

EOF



echo "==> Step 2 files written successfully to ${PROJECT_DIR}"
