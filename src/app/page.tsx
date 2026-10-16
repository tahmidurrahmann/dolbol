import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("app");
  const locale = await getLocale();

  return (
    <section className="my-auto flex flex-col justify-center gap-8 py-6">
      {/* Hero Badge & Heading */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3.5 py-1 text-xs font-semibold text-[var(--color-primary)] shadow-xs">
          <span>✨</span>
          <span>
            {locale === "bn"
              ? "বাংলাদেশের বন্ধুদের গ্রুপ ট্যুরের হিসাব"
              : "Group Travel & Expense Splitter for Bangladesh"}
          </span>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-fg)] sm:text-4xl">
          {t("name")}
        </h1>

        <p className="max-w-md text-base text-[var(--color-fg-muted)] leading-relaxed">
          {t("tagline")}
        </p>
      </div>

      {/* Feature Highlight Cards */}
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto w-full">
        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-xs transition-shadow hover:shadow-sm">
          <span className="text-2xl mb-1">⚡</span>
          <span className="text-xs font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "লগইন ঝামেলাহীন" : "No Login Required"}
          </span>
          <span className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            {locale === "bn" ? "লিংক শেয়ারেই সবাই যুক্ত" : "Just share link with friends"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-xs transition-shadow hover:shadow-sm">
          <span className="text-2xl mb-1">🤖</span>
          <span className="text-xs font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "এআই মেসেজ পার্সার" : "AI Expense Parser"}
          </span>
          <span className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            {locale === "bn" ? "বাংলা ও বাংলিশ টেক্সট" : "Bangla & Banglish input"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-xs transition-shadow hover:shadow-sm">
          <span className="text-2xl mb-1">৳</span>
          <span className="text-xs font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "পূর্ণ টাকার হিসাব" : "Whole BDT (৳)"}
          </span>
          <span className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            {locale === "bn" ? "দশমিকের ঝামেলা নেই" : "Integer rounding to payer"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-xs transition-shadow hover:shadow-sm">
          <span className="text-2xl mb-1">🗺️</span>
          <span className="text-xs font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "ভোট ও ভ্রমণ সূচি" : "Voting & Itinerary"}
          </span>
          <span className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            {locale === "bn" ? "দিন অনুযায়ী সম্পূর্ণ প্ল্যান" : "Day-by-day activity plan"}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 max-w-md mx-auto w-full pt-2">
        <Link
          href="/trips/new"
          className="group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-emerald-700 px-6 py-3.5 text-base font-bold text-[var(--color-primary-fg)] shadow-md transition-all hover:shadow-lg hover:brightness-105 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <span>➕</span>
          <span>{t("createTrip")}</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>

        <Link
          href="/trips/join"
          className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-base font-semibold text-[var(--color-fg)] shadow-xs transition-all hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-primary)]/40 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <span>🔗</span>
          <span>{t("joinTrip")}</span>
        </Link>
      </div>

      {/* Footer tagline */}
      <p className="text-center text-xs text-[var(--color-fg-muted)] pt-2">
        {t("footer")}
      </p>
    </section>
  );
}
