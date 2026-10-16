import { cookies } from "next/headers";

import type { Member } from "@/generated/prisma/client";

import { generateSessionToken, hashSessionToken } from "@/lib/crypto";

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
