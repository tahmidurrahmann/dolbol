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

        <p className="max-w-xl text-base sm:text-lg text-[var(--color-fg-muted)] leading-relaxed">
          {t("tagline")}
        </p>
      </div>

      {/* Feature Highlight Cards (1 col mobile, 2 col tablet, 4 col desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto w-full">
        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30">
          <span className="text-3xl mb-2">⚡</span>
          <span className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "লগইন ঝামেলাহীন" : "No Login Required"}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)] mt-1">
            {locale === "bn" ? "লিংক শেয়ারেই বন্ধুদের সাথে নিমেষেই যুক্ত" : "Just share the trip link with friends to get started"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30">
          <span className="text-3xl mb-2">🤖</span>
          <span className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "এআই মেসেজ পার্সার" : "AI Expense Parser"}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)] mt-1">
            {locale === "bn" ? "স্বাভাবিক বাংলা ও বাংলিশ টেক্সট থেকে স্বয়ংক্রিয় এন্ট্রি" : "Natural Bangla & Banglish text parsing into split cards"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30">
          <span className="text-3xl mb-2">৳</span>
          <span className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "পূর্ণ টাকার হিসাব" : "Whole BDT (৳)"}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)] mt-1">
            {locale === "bn" ? "পয়সা বা ভগ্নাংশ ছাড়া নিখুঁত পূর্ণ টাকা হিসাব" : "Zero paisa confusion, fair integer rounding"}
          </span>
        </div>

        <div className="flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30">
          <span className="text-3xl mb-2">🗺️</span>
          <span className="text-sm font-bold text-[var(--color-fg)]">
            {locale === "bn" ? "ভোট ও ভ্রমণ সূচি" : "Voting & Itinerary"}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)] mt-1">
            {locale === "bn" ? "গন্তব্য ভোট ও দিনভিত্তিক সম্পূর্ণ ভ্রমণ পরিকল্পনা" : "Democratic destination voting and daily activity plans"}
          </span>
        </div>
      </div>

      {/* Action Buttons (stacked mobile, side-by-side tablet/desktop) */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto w-full pt-2">
        <Link
          href="/trips/new"
          className="group inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-emerald-700 px-6 py-3.5 text-base font-bold text-white shadow-md transition-all hover:shadow-lg hover:brightness-105 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <span>➕</span>
          <span>{t("createTrip")}</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>

        <Link
          href="/trips/join"
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5 text-base font-bold text-[var(--color-fg)] shadow-xs transition-all hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-primary)]/40 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
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
