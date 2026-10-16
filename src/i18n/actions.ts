"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isSupportedLocale, LOCALE_COOKIE_NAME } from "@/i18n/config";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const rawLocale = formData.get("locale");
  const nextLocale =
    typeof rawLocale === "string" && isSupportedLocale(rawLocale)
      ? rawLocale
      : "bn";

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, nextLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  revalidatePath("/", "layout");
}
