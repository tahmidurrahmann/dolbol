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

import { formatDate, type SupportedLocale, toBanglaDigits } from "@/lib/format";

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
                        {hasPin
                          ? `🔒 ${tWho("pinProtected")}`
                          : tWho("noPinSet")}
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
