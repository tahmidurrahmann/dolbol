"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALE_COOKIE_NAME } from "@/i18n/config";
import type { SupportedLocale } from "@/lib/format";

interface LanguageToggleProps {
  currentLocale: SupportedLocale;
}

export function LanguageToggle({ currentLocale }: LanguageToggleProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isBn = currentLocale === "bn";

  function handleSwitch(target: SupportedLocale) {
    if (target === currentLocale || isPending) return;

    // Set cookies synchronously on the client — Next.js reads these on the next render
    document.cookie = `${LOCALE_COOKIE_NAME}=${target}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("trip_hub_locale", target);
    } catch {
      // ignore storage errors
    }

    const formData = new FormData();
    formData.append("locale", target);

    startTransition(async () => {
      try {
        await setLocaleAction(formData);
      } catch {
        // Cookies already set; continue even if the network action fails
      }
      // router.refresh() re-renders server components using the new cookie
      // WITHOUT doing a full page reload, so form state is preserved
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Language selection"
      className="inline-flex items-center rounded-xl bg-[#f0f3f1] p-1 border border-gray-200/70 shadow-2xs"
    >
      {/* Bangla Option */}
      <button
        type="button"
        onClick={() => handleSwitch("bn")}
        disabled={isPending}
        className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-black transition-all select-none cursor-pointer ${
          isBn
            ? "bg-white text-gray-900 shadow-xs border border-gray-200/50"
            : "text-gray-500 hover:text-gray-900"
        }`}
      >
        বাং
      </button>

      {/* English Option */}
      <button
        type="button"
        onClick={() => handleSwitch("en")}
        disabled={isPending}
        className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-black transition-all select-none cursor-pointer ${
          !isBn
            ? "bg-white text-gray-900 shadow-xs border border-gray-200/50"
            : "text-gray-500 hover:text-gray-900"
        }`}
      >
        EN
      </button>
    </div>
  );
}
