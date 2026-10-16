"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  getCurrentMemberForTrip,
} from "@/lib/session";
import {
  addGuestFormSchema,
  createTripFormSchema,
  expenseFormSchema,
  joinTripFormSchema,
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
          displayName: creator.displayName,
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

// ---- Step 3 & Step 4: Money Core + Safety Layer Server Actions -----------

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

  // Step 4 Guard 1: Locked trips block every write route
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

  // Step 4 Guard 4: Duplicate-entry warning check (unless user checked confirmDuplicate)
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

    // Step 4 Guard 2: Verify share amounts add up to expense amount and belong to trip members
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
    // Update existing expense + write ActivityLog in the same transaction
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
    // Create new expense + write ActivityLog in the same transaction
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

  // Soft delete only (deletedAt), never hard delete, with ActivityLog in the same transaction
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

  // Soft delete only (deletedAt), never hard delete, with ActivityLog in the same transaction
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

/**
 * Step 4 Guard 3 Server Action: Verifies vote option belongs to the exact same trip
 * and blocks locked trips before upserting a member's destination vote.
 */
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
        after: {
          name: option!.name,
        },
      },
    });
  });

  revalidatePath(`/trips/${trip.slug}`);
  redirect(`/trips/${trip.slug}`);
}
