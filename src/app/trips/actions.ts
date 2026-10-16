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
