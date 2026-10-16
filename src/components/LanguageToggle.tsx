import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/i18n/actions";
import type { SupportedLocale } from "@/lib/format";

export async function LanguageToggle() {
  const locale = (await getLocale()) as SupportedLocale;
  const t = await getTranslations("header");

  const targetLocale: SupportedLocale = locale === "bn" ? "en" : "bn";
  const targetLabel =
    targetLocale === "bn" ? t("languageLabelBn") : t("languageLabelEn");

  return (
    <form action={setLocaleAction}>
      <input type="hidden" name="locale" value={targetLocale} />
      <button
        type="submit"
        aria-label={t("switchLanguageAria")}
        className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-base font-medium text-[var(--color-fg)] transition-colors motion-reduce:transition-none hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
      >
        {targetLabel}
      </button>
    </form>
  );
}
