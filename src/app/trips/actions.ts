"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinRateLimit,
} from "@/lib/rate-limit";
import {
  banglaToAsciiDigits,
  extractSlugFromInput,
  generateTripSlug,
  hashPin,
  normalizeNameKey,
  verifyPin,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  computeExpenseShares,
  type ExactShareInput,
  type ExpenseCategoryValue,
  type PercentShareInput,
  type ShareOutput,
} from "@/lib/money";
import { hasDuplicateDestinationOption } from "@/lib/planning";
import {
  assertTripWritable,
  assertValidExpenseSharesForTrip,
  assertVoteOptionBelongsToTrip,
  findDuplicateExpenseCandidate,
  SafetyViolationError,
} from "@/lib/safety";
import {
  clearMemberDeviceSession,
  createMemberDeviceSession,
  getCurrentMemberAndSessionForTrip,
  getCurrentMemberForTrip,
} from "@/lib/session";
import {
  addGuestFormSchema,
  createTripFormSchema,
  destinationOptionFormSchema,
  expenseFormSchema,
  itineraryItemFormSchema,
  joinTripFormSchema,
  MEMBER_EMOJIS,
  parseFriendsNames,
  reclaimMemberFormSchema,
  renameMemberFormSchema,
  settlementFormSchema,
} from "@/lib/trips";

function parseOptionalDhakaDate(yyyyMmDd: string | undefined): Date | null {
  if (!yyyyMmDd) {
    return null;
  }
  return new Date(`${yyyyMmDd}T00:00:00+06:00`);
}

function parseDhakaExpenseDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00+06:00`);
}

export async function createTripAction(formData: FormData): Promise<void> {
  const parsed = createTripFormSchema.safeParse({
    name: formData.get("name") ?? "",
    destination: formData.get("destination") ?? undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
    creatorName: formData.get("creatorName") ?? "",
    friendsNames: formData.get("friendsNames") ?? undefined,
    creatorEmoji: formData.get("creatorEmoji") ?? undefined,
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
    friendsNames,
    creatorEmoji,
    creatorPin,
  } = parsed.data;

  const slug = generateTripSlug();
  const nameKey = normalizeNameKey(creatorName);
  const pinHash = creatorPin ? hashPin(creatorPin) : null;

  // Pick random emoji for creator if not provided
  const chosenCreatorEmoji =
    creatorEmoji && creatorEmoji.trim().length > 0 && creatorEmoji !== "🎒"
      ? creatorEmoji
      : (MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)] ?? "🎒");

  // Parse and deduplicate friends' names (up to 30)
  const validatedFriends = parseFriendsNames(friendsNames, {
    creatorName,
    maxCount: 30,
  });

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
        emoji: chosenCreatorEmoji,
        isGuest: false,
        pinHash,
      },
    });

    const updatedTrip = await tx.trip.update({
      where: { id: trip.id },
      data: { creatorMemberId: creator.id },
    });

    // Pre-add friends with rotated/random emojis
    let emojiIdx = 1;
    for (const friendName of validatedFriends) {
      const friendEmoji =
        MEMBER_EMOJIS[emojiIdx % MEMBER_EMOJIS.length] ?? "🎒";
      emojiIdx++;
      await tx.member.create({
        data: {
          tripId: trip.id,
          displayName: friendName,
          nameKey: normalizeNameKey(friendName),
          emoji: friendEmoji,
          isGuest: false,
          pinHash: null,
        },
      });
    }

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
          displayName: creator.displayName,
          preAddedFriendsCount: validatedFriends.length,
        },
      },
    });

    return { trip: updatedTrip, creator };
  });

  await createMemberDeviceSession(result.creator.id, result.trip.id);
  const redirectUrl = result.creator.pinHash
    ? `/trips/${result.trip.slug}`
    : `/trips/${result.trip.slug}?newTrip=1`;
  redirect(redirectUrl);
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

  try {
    assertTripWritable(trip);
  } catch {
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
    // If existing member is an unclaimed guest with no active device sessions and no PIN, seamlessly claim it!
    const activeSessionsCount = await db.memberSession.count({
      where: { memberId: existing.id },
    });

    if (existing.isGuest && activeSessionsCount === 0 && !existing.pinHash) {
      const pinHash = parsed.data.pin ? hashPin(parsed.data.pin) : null;
      await db.member.update({
        where: { id: existing.id },
        data: {
          isGuest: false,
          emoji: parsed.data.emoji ?? existing.emoji,
          ...(pinHash ? { pinHash } : {}),
        },
      });

      await createMemberDeviceSession(existing.id, trip.id);

      await db.activityLog.create({
        data: {
          tripId: trip.id,
          memberId: existing.id,
          entityType: "member",
          entityId: existing.id,
          action: "join",
          after: {
            displayName: existing.displayName,
            claimedFromGuest: true,
          },
        },
      }).catch(() => undefined);

      revalidatePath(`/trips/${trip.slug}`);
      redirect(`/trips/${trip.slug}`);
    }

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

async function getClientIp(): Promise<string> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return headerStore.get("x-real-ip") || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
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

  const clientIp = await getClientIp();

  // Brute-force rate limit protection (generic response, no hint)
  const rateLimitStatus = checkPinRateLimit(member.id, clientIp);
  if (!rateLimitStatus.allowed) {
    redirect(`/trips/${trip.slug}?error=pin_locked`);
  }

  if (member.pinHash) {
    if (!parsed.data.pin || !verifyPin(parsed.data.pin, member.pinHash)) {
      const attempt = recordFailedPinAttempt(member.id, clientIp);
      if (attempt.isLocked) {
        redirect(`/trips/${trip.slug}?error=pin_locked`);
      }
      redirect(`/trips/${trip.slug}?error=wrong_pin`);
    }
  }

  // Clear rate limit on successful PIN authentication
  resetPinRateLimit(member.id, clientIp);

  await createMemberDeviceSession(member.id, trip.id);

  // Write ActivityLog entry for claim from a new device (do NOT store IP addresses)
  await db.activityLog.create({
    data: {
      tripId: trip.id,
      memberId: member.id,
      entityType: "member",
      entityId: member.id,
      action: "claim_device",
      after: {
        displayName: member.displayName,
      },
    },
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

/**
 * Claim an existing member from a new device when no PIN is set, after user confirmation.
 */
export async function claimExistingMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!slug || !memberId) {
    redirect("/trips/join?error=invalid_input");
  }

  const trip = await db.trip.findUnique({
    where: { slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const member = await db.member.findUnique({
    where: { id: memberId },
  });

  if (!member || member.tripId !== trip.id || member.isGuest) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  if (member.pinHash) {
    redirect(`/trips/${trip.slug}?error=wrong_pin`);
  }

  await createMemberDeviceSession(member.id, trip.id);

  // Write ActivityLog entry for claim from a new device (do NOT store IP addresses)
  await db.activityLog.create({
    data: {
      tripId: trip.id,
      memberId: member.id,
      entityType: "member",
      entityId: member.id,
      action: "claim_device",
      after: {
        displayName: member.displayName,
      },
    },
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

/**
 * Helper: Ensures the request is made by the trip creator.
 * If the creator has a PIN set AND the current session is less than 24 hours old,
 * verifies the creatorPin submitted in formData.
 */
async function assertCreatorAuthorizedWithPinIfRecent(
  trip: { id: string; slug: string; creatorMemberId?: string | null },
  formData: FormData,
) {
  const sessionInfo = await getCurrentMemberAndSessionForTrip(trip.id);
  if (!sessionInfo || sessionInfo.member.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const { member: creator, session } = sessionInfo;

  // Session less than 24 hours old AND creator has a PIN set
  const sessionAgeMs = Date.now() - session.createdAt.getTime();
  const isSessionUnder24Hours = sessionAgeMs < 24 * 60 * 60 * 1000;

  if (creator.pinHash && isSessionUnder24Hours) {
    const creatorPin = String(formData.get("creatorPin") ?? "").trim();
    const clientIp = await getClientIp();

    const rateStatus = checkPinRateLimit(creator.id, clientIp);
    if (!rateStatus.allowed) {
      redirect(`/trips/${trip.slug}?error=pin_locked`);
    }

    if (!creatorPin || !verifyPin(creatorPin, creator.pinHash)) {
      const attempt = recordFailedPinAttempt(creator.id, clientIp);
      if (attempt.isLocked) {
        redirect(`/trips/${trip.slug}?error=pin_locked`);
      }
      redirect(`/trips/${trip.slug}?error=wrong_pin`);
    }

    resetPinRateLimit(creator.id, clientIp);
  }

  return { creator, session };
}

/**
 * Creator-only control: Reset all device sessions for a member (forces re-claim).
 * A creator can never view or modify another member's PIN.
 */
export async function resetMemberDevicesAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!slug || !memberId) {
    redirect("/trips/join?error=invalid_input");
  }

  const trip = await db.trip.findUnique({
    where: { slug },
    include: { members: true },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const { creator: currentMember } =
    await assertCreatorAuthorizedWithPinIfRecent(trip, formData);

  const targetMember = trip.members.find((m) => m.id === memberId);
  if (!targetMember) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  // Cannot reset creator's own devices via this action
  if (targetMember.id === trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  // Remove all sessions for this member
  await db.memberSession.deleteMany({
    where: { memberId: targetMember.id },
  });

  // Log action to ActivityLog
  await db.activityLog.create({
    data: {
      tripId: trip.id,
      memberId: currentMember.id,
      entityType: "member",
      entityId: targetMember.id,
      action: "reset_devices",
      after: {
        displayName: targetMember.displayName,
      },
    },
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}


/**
 * One-tap claiming for pre-added members who don't have a PIN set yet.
 */
export async function claimMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!slug || !memberId) {
    redirect("/trips/join?error=invalid_input");
  }

  const trip = await db.trip.findUnique({
    where: { slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const member = await db.member.findUnique({
    where: { id: memberId },
  });

  if (!member || member.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  if (member.pinHash) {
    // Member has PIN protection, must use reclaim with PIN
    redirect(`/trips/${trip.slug}?reclaim=${member.id}`);
  }

  // If claiming a pre-added guest profile, activate it into a full member
  if (member.isGuest) {
    await db.member.update({
      where: { id: member.id },
      data: { isGuest: false },
    });
  }

  await createMemberDeviceSession(member.id, trip.id);

  await db.activityLog.create({
    data: {
      tripId: trip.id,
      memberId: member.id,
      entityType: "member",
      entityId: member.id,
      action: "claim",
      after: {
        displayName: member.displayName,
        claimedFromGuest: member.isGuest,
      },
    },
  }).catch(() => undefined);

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

/**
 * Allows the current logged-in user to update their name, emoji, or set an optional PIN.
 */
export async function updateMyProfileAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) redirect("/trips/join?error=trip_not_found");

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) redirect(`/trips/${trip.slug}`);

  const rawDisplayName = String(formData.get("displayName") ?? "").trim();
  const displayName = rawDisplayName || currentMember.displayName;
  const emoji =
    String(formData.get("emoji") ?? "").trim() ||
    currentMember.emoji ||
    "🎒";
  const pin = String(formData.get("pin") ?? "").trim();

  if (displayName.length < 1 || displayName.length > 40) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  const newNameKey = normalizeNameKey(displayName);
  if (newNameKey !== currentMember.nameKey) {
    const existing = await db.member.findUnique({
      where: { tripId_nameKey: { tripId: trip.id, nameKey: newNameKey } },
    });
    if (existing) {
      redirect(`/trips/${trip.slug}?error=duplicate_name`);
    }
  }

  let pinHash = currentMember.pinHash;
  if (pin) {
    const ascii = banglaToAsciiDigits(pin);
    if (!/^\d{4,6}$/.test(ascii)) {
      redirect(`/trips/${trip.slug}?error=invalid_pin`);
    }
    pinHash = hashPin(ascii);
  }

  await db.member.update({
    where: { id: currentMember.id },
    data: {
      displayName,
      nameKey: newNameKey,
      emoji,
      pinHash,
    },
  });

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

  try {
    assertTripWritable(trip);
  } catch {
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

  try {
    assertTripWritable(trip);
  } catch {
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

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!slug || !memberId) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const { creator: currentMember } =
    await assertCreatorAuthorizedWithPinIfRecent(trip, formData);

  const targetMember = await db.member.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}`);
  }

  if (targetMember.id === trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=cannot_delete_creator`);
  }

  // Safety check: Ensure the member has NO expenses or settlements recorded
  const hasExpenses = await db.expense.count({
    where: {
      OR: [{ paidById: targetMember.id }, { createdById: targetMember.id }],
    },
  });
  const hasShares = await db.expenseShare.count({
    where: { memberId: targetMember.id },
  });
  const hasSettlements = await db.settlement.count({
    where: {
      OR: [
        { fromMemberId: targetMember.id },
        { toMemberId: targetMember.id },
        { createdById: targetMember.id },
      ],
    },
  });

  if (hasExpenses > 0 || hasShares > 0 || hasSettlements > 0) {
    redirect(`/trips/${trip.slug}?error=member_has_transactions`);
  }

  await db.$transaction(async (tx) => {
    // Delete device sessions
    await tx.memberSession.deleteMany({
      where: { memberId: targetMember.id },
    });

    // Delete votes
    await tx.vote.deleteMany({
      where: { memberId: targetMember.id },
    });

    // Log deletion activity
    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "member",
        entityId: targetMember.id,
        action: "delete",
        before: {
          displayName: targetMember.displayName,
          emoji: targetMember.emoji,
        },
      },
    });

    // Delete member record
    await tx.member.delete({
      where: { id: targetMember.id },
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

  const { creator: currentMember } =
    await assertCreatorAuthorizedWithPinIfRecent(trip, formData);

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

// ---- Step 3, 4 & 6: Money Core + Safety Layer + AI Confirm Save ---------

export async function saveExpenseAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = expenseFormSchema.safeParse({
    slug,
    expenseId: formData.get("expenseId") ?? undefined,
    title: formData.get("title") ?? "",
    amount: formData.get("amount") ?? "",
    category: formData.get("category") ?? "OTHER",
    expenseDate: formData.get("expenseDate") ?? "",
    paidById: formData.get("paidById") ?? "",
    splitType: formData.get("splitType") ?? "EQUAL",
    note: formData.get("note") ?? undefined,
    rawInput: formData.get("rawInput") ?? undefined,
    routeFrom: formData.get("routeFrom") ?? undefined,
    routeTo: formData.get("routeTo") ?? undefined,
    placeName: formData.get("placeName") ?? undefined,
  });

  if (!parsed.success) {
    const hasAmountErr = parsed.error.issues.some(
      (i) => i.message === "invalid_amount",
    );
    const code = hasAmountErr ? "invalid_amount" : "invalid_input";
    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: {
      members: true,
      expenses: {
        where: { deletedAt: null },
      },
    },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const validMemberIds = new Set(trip.members.map((m) => m.id));
  const expenseDate = parseDhakaExpenseDate(parsed.data.expenseDate);

  const confirmDuplicate = formData.get("confirmDuplicate") === "true";
  if (!confirmDuplicate) {
    const duplicate = findDuplicateExpenseCandidate(
      {
        title: parsed.data.title,
        amount: parsed.data.amount,
        category: parsed.data.category,
        expenseDate,
        paidById: parsed.data.paidById,
        excludeExpenseId: parsed.data.expenseId,
      },
      trip.expenses.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        category: e.category as ExpenseCategoryValue,
        expenseDate: e.expenseDate,
        paidById: e.paidById,
        deletedAt: e.deletedAt,
      })),
    );

    if (duplicate) {
      redirect(
        `/trips/${trip.slug}?error=duplicate_expense_warning#expense-form`,
      );
    }
  }

  let shares: ShareOutput[];
  try {
    if (parsed.data.splitType === "EQUAL") {
      const selectedIds = formData
        .getAll("participantIds")
        .map((v) => String(v).trim())
        .filter((id) => validMemberIds.has(id));
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "EQUAL",
        participantIds: selectedIds,
      });
    } else if (parsed.data.splitType === "EXACT") {
      const exactShares: ExactShareInput[] = [];
      for (const m of trip.members) {
        const rawVal = String(formData.get(`exact_${m.id}`) ?? "").trim();
        if (!rawVal) continue;
        const num = Number(banglaToAsciiDigits(rawVal.replace(/,/g, "")));
        if (num > 0) {
          exactShares.push({ memberId: m.id, amount: num });
        }
      }
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "EXACT",
        exactShares,
      });
    } else {
      const percentShares: PercentShareInput[] = [];
      for (const m of trip.members) {
        const rawVal = String(formData.get(`percent_${m.id}`) ?? "").trim();
        if (!rawVal) continue;
        const num = Number(banglaToAsciiDigits(rawVal.replace(/,/g, "")));
        if (num > 0) {
          percentShares.push({ memberId: m.id, percent: num });
        }
      }
      shares = computeExpenseShares({
        amount: parsed.data.amount,
        paidById: parsed.data.paidById,
        splitType: "PERCENT",
        percentShares,
      });
    }

    assertValidExpenseSharesForTrip({
      expenseAmount: parsed.data.amount,
      paidById: parsed.data.paidById,
      shares,
      validTripMemberIds: validMemberIds,
    });
  } catch {
    redirect(`/trips/${trip.slug}?error=invalid_shares`);
  }

  if (parsed.data.expenseId) {
    const existingExpense = await db.expense.findUnique({
      where: { id: parsed.data.expenseId },
      include: { shares: true },
    });

    if (
      !existingExpense ||
      existingExpense.tripId !== trip.id ||
      existingExpense.deletedAt
    ) {
      redirect(`/trips/${trip.slug}?error=invalid_input`);
    }

    // Security check: Only the payer, author, or trip creator can edit this expense
    const isPayer = currentMember.id === existingExpense.paidById;
    const isAuthor = currentMember.id === existingExpense.createdById;
    const isCreator = currentMember.id === trip.creatorMemberId;

    if (!isPayer && !isAuthor && !isCreator) {
      redirect(`/trips/${trip.slug}?error=unauthorized`);
    }

    await db.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({
        where: { expenseId: existingExpense.id },
      });

      const updated = await tx.expense.update({
        where: { id: existingExpense.id },
        data: {
          title: parsed.data.title,
          amount: parsed.data.amount,
          category: parsed.data.category,
          expenseDate,
          paidById: parsed.data.paidById,
          splitType: parsed.data.splitType,
          note: parsed.data.note ?? null,
          shares: {
            create: shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
        },
      });

      await tx.activityLog.create({
        data: {
          tripId: trip.id,
          memberId: currentMember.id,
          entityType: "expense",
          entityId: updated.id,
          action: "update",
          before: {
            title: existingExpense.title,
            amount: existingExpense.amount,
            category: existingExpense.category,
            paidById: existingExpense.paidById,
            splitType: existingExpense.splitType,
            shares: existingExpense.shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
          after: {
            title: updated.title,
            amount: updated.amount,
            category: updated.category,
            paidById: updated.paidById,
            splitType: updated.splitType,
            shares,
          },
        },
      });
    });
  } else {
    await db.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          tripId: trip.id,
          title: parsed.data.title,
          amount: parsed.data.amount,
          category: parsed.data.category,
          expenseDate,
          paidById: parsed.data.paidById,
          createdById: currentMember.id,
          splitType: parsed.data.splitType,
          note: parsed.data.note ?? null,
          rawInput: parsed.data.rawInput ?? null,
          routeFrom: parsed.data.routeFrom ?? null,
          routeTo: parsed.data.routeTo ?? null,
          placeName: parsed.data.placeName ?? null,
          shares: {
            create: shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
            })),
          },
        },
      });

      await tx.activityLog.create({
        data: {
          tripId: trip.id,
          memberId: currentMember.id,
          entityType: "expense",
          entityId: created.id,
          action: "create",
          after: {
            title: created.title,
            amount: created.amount,
            category: created.category,
            paidById: created.paidById,
            splitType: created.splitType,
            shares,
          },
        },
      });
    });
  }

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const expenseId = String(formData.get("expenseId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const existing = await db.expense.findUnique({
    where: { id: expenseId },
  });

  if (!existing || existing.tripId !== trip.id || existing.deletedAt) {
    redirect(`/trips/${trip.slug}`);
  }

  // Security check: Only the payer, the person who logged the expense, or the trip creator can delete it
  const isPayer = currentMember.id === existing.paidById;
  const isAuthor = currentMember.id === existing.createdById;
  const isCreator = currentMember.id === trip.creatorMemberId;

  if (!isPayer && !isAuthor && !isCreator) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const deletedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: existing.id },
      data: { deletedAt },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "expense",
        entityId: existing.id,
        action: "delete",
        before: {
          title: existing.title,
          amount: existing.amount,
          paidById: existing.paidById,
        },
        after: {
          title: existing.title,
          amount: existing.amount,
          deletedAt: deletedAt.toISOString(),
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function createSettlementAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = settlementFormSchema.safeParse({
    slug,
    fromMemberId: formData.get("fromMemberId") ?? "",
    toMemberId: formData.get("toMemberId") ?? "",
    amount: formData.get("amount") ?? "",
  });

  if (!parsed.success) {
    const hasSameErr = parsed.error.issues.some(
      (i) => i.message === "same_member_settlement",
    );
    const hasAmountErr = parsed.error.issues.some(
      (i) => i.message === "invalid_amount",
    );
    const code = hasSameErr
      ? "same_member_settlement"
      : hasAmountErr
        ? "invalid_amount"
        : "invalid_input";
    redirect(`/trips/${encodeURIComponent(slug)}?error=${code}`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: { members: true },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const validMemberIds = new Set(trip.members.map((m) => m.id));
  if (
    !validMemberIds.has(parsed.data.fromMemberId) ||
    !validMemberIds.has(parsed.data.toMemberId)
  ) {
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  await db.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: {
        tripId: trip.id,
        fromMemberId: parsed.data.fromMemberId,
        toMemberId: parsed.data.toMemberId,
        amount: parsed.data.amount,
        createdById: currentMember.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "settlement",
        entityId: settlement.id,
        action: "create",
        after: {
          fromMemberId: settlement.fromMemberId,
          toMemberId: settlement.toMemberId,
          amount: settlement.amount,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteSettlementAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const settlementId = String(formData.get("settlementId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const existing = await db.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!existing || existing.tripId !== trip.id || existing.deletedAt) {
    redirect(`/trips/${trip.slug}`);
  }

  // Security check: Only the payer, receiver, or trip creator can delete this settlement
  const isPayer = currentMember.id === existing.fromMemberId;
  const isReceiver = currentMember.id === existing.toMemberId;
  const isCreator = currentMember.id === trip.creatorMemberId;

  if (!isPayer && !isReceiver && !isCreator) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const deletedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.settlement.update({
      where: { id: existing.id },
      data: { deletedAt },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "settlement",
        entityId: existing.id,
        action: "delete",
        before: {
          fromMemberId: existing.fromMemberId,
          toMemberId: existing.toMemberId,
          amount: existing.amount,
        },
        after: {
          fromMemberId: existing.fromMemberId,
          toMemberId: existing.toMemberId,
          amount: existing.amount,
          deletedAt: deletedAt.toISOString(),
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

// ---- Step 5: Destination Voting & Day-by-Day Itinerary Actions -----------

export async function proposeDestinationOptionAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = destinationOptionFormSchema.safeParse({
    slug,
    name: formData.get("name") ?? "",
  });

  if (!parsed.success) {
    redirect(`/trips/${encodeURIComponent(slug)}?error=invalid_input`);
  }

  const trip = await db.trip.findUnique({
    where: { slug: parsed.data.slug },
    include: { options: true },
  });

  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  if (hasDuplicateDestinationOption(parsed.data.name, trip.options)) {
    redirect(`/trips/${trip.slug}?error=duplicate_option`);
  }

  await db.$transaction(async (tx) => {
    const option = await tx.destinationOption.create({
      data: {
        tripId: trip.id,
        name: parsed.data.name,
        proposedById: currentMember.id,
      },
    });

    await tx.vote.upsert({
      where: {
        tripId_memberId: {
          tripId: trip.id,
          memberId: currentMember.id,
        },
      },
      update: { optionId: option.id },
      create: {
        tripId: trip.id,
        memberId: currentMember.id,
        optionId: option.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "destination",
        entityId: option.id,
        action: "create",
        after: { name: option.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function castDestinationVoteAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const optionId = String(formData.get("optionId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const option = await db.destinationOption.findUnique({
    where: { id: optionId },
    select: { id: true, tripId: true, name: true },
  });

  try {
    assertVoteOptionBelongsToTrip({
      tripId: trip.id,
      member: currentMember,
      option,
    });
  } catch (err) {
    if (
      err instanceof SafetyViolationError &&
      err.code === "cross_trip_option"
    ) {
      redirect(`/trips/${trip.slug}?error=cross_trip_option`);
    }
    redirect(`/trips/${trip.slug}?error=invalid_input`);
  }

  await db.$transaction(async (tx) => {
    const vote = await tx.vote.upsert({
      where: {
        tripId_memberId: {
          tripId: trip.id,
          memberId: currentMember.id,
        },
      },
      update: { optionId: option!.id },
      create: {
        tripId: trip.id,
        memberId: currentMember.id,
        optionId: option!.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "vote",
        entityId: vote.id,
        action: "upsert",
        after: { name: option!.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function setTripDestinationFromOptionAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const optionId = String(formData.get("optionId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const option = await db.destinationOption.findUnique({
    where: { id: optionId },
  });

  try {
    assertVoteOptionBelongsToTrip({
      tripId: trip.id,
      member: currentMember,
      option,
    });
  } catch {
    redirect(`/trips/${trip.slug}?error=cross_trip_option`);
  }

  await db.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: trip.id },
      data: { destination: option!.name },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "trip",
        entityId: trip.id,
        action: "set_destination",
        before: { destination: trip.destination },
        after: { destination: option!.name },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function addItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const parsed = itineraryItemFormSchema.safeParse({
    slug,
    dayNumber: formData.get("dayNumber") ?? "1",
    time: formData.get("time") ?? undefined,
    title: formData.get("title") ?? "",
    notes: formData.get("notes") ?? undefined,
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

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  await db.$transaction(async (tx) => {
    const existingForDay = await tx.itineraryItem.findMany({
      where: {
        tripId: trip.id,
        dayNumber: parsed.data.dayNumber,
      },
      orderBy: { position: "desc" },
      take: 1,
    });

    const nextPosition = (existingForDay[0]?.position ?? 0) + 1;

    const item = await tx.itineraryItem.create({
      data: {
        tripId: trip.id,
        dayNumber: parsed.data.dayNumber,
        time: parsed.data.time ?? null,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        position: nextPosition,
        createdById: currentMember.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "itinerary",
        entityId: item.id,
        action: "create",
        after: {
          title: item.title,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function moveItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const target = await db.itineraryItem.findUnique({
    where: { id: itemId },
  });

  if (!target || target.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}`);
  }

  const dayItems = await db.itineraryItem.findMany({
    where: {
      tripId: trip.id,
      dayNumber: target.dayNumber,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const idx = dayItems.findIndex((i) => i.id === target.id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  const neighbor = dayItems[swapIdx];

  if (idx >= 0 && neighbor) {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < dayItems.length; i++) {
        let newPos = i + 1;
        if (i === idx) newPos = swapIdx + 1;
        else if (i === swapIdx) newPos = idx + 1;

        await tx.itineraryItem.update({
          where: { id: dayItems[i]!.id },
          data: { position: newPos },
        });
      }
    });
  }

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function deleteItineraryItemAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember) {
    redirect(`/trips/${trip.slug}?error=unauthorized`);
  }

  const existing = await db.itineraryItem.findUnique({
    where: { id: itemId },
  });

  if (!existing || existing.tripId !== trip.id) {
    redirect(`/trips/${trip.slug}`);
  }

  await db.$transaction(async (tx) => {
    await tx.itineraryItem.delete({
      where: { id: existing.id },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "itinerary",
        entityId: existing.id,
        action: "delete",
        before: { title: existing.title },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}

export async function updateTripDatesAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  const endDateRaw = String(formData.get("endDate") ?? "").trim();

  const trip = await db.trip.findUnique({ where: { slug } });
  if (!trip) {
    redirect("/trips/join?error=trip_not_found");
  }

  try {
    assertTripWritable(trip);
  } catch {
    redirect(`/trips/${trip.slug}?error=trip_locked`);
  }

  const currentMember = await getCurrentMemberForTrip(trip.id);
  if (!currentMember || currentMember.id !== trip.creatorMemberId) {
    redirect(`/trips/${trip.slug}?error=not_creator`);
  }

  const parsedStart = parseOptionalDhakaDate(startDateRaw || undefined);
  const parsedEnd = parseOptionalDhakaDate(endDateRaw || undefined);

  if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
    redirect(`/trips/${trip.slug}?error=invalid_dates`);
  }

  await db.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: trip.id },
      data: {
        startDate: parsedStart,
        endDate: parsedEnd,
      },
    });

    await tx.activityLog.create({
      data: {
        tripId: trip.id,
        memberId: currentMember.id,
        entityType: "trip",
        entityId: trip.id,
        action: "update_dates",
        after: {
          startDate: parsedStart ? parsedStart.toISOString() : null,
          endDate: parsedEnd ? parsedEnd.toISOString() : null,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  revalidatePath(`/trips/${trip.slug}/summary`);
  redirect(`/trips/${trip.slug}`);
}

