import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BackToTripBar } from "@/components/BackToTripBar";
import { ExpenseExplainerDemo } from "@/components/ExpenseExplainerDemo";
import { RecentTripsList } from "@/components/RecentTripsList";
import type { SupportedLocale } from "@/lib/format";

export default async function HomePage() {
  const t = await getTranslations("app");
  const tRecent = await getTranslations("recentTrips");
  const locale = await getLocale();
  const bn = locale === "bn";

  const steps = [
    {
      num: bn ? "১" : "1",
      icon: "🌴",
      title: bn ? "ট্রিপ খুলুন" : "Create a trip",
      body: bn
        ? "ট্রিপের নাম আর বন্ধুদের নাম দিন। কোনো ইমেইল বা পাসওয়ার্ড লাগবে না।"
        : "Add a trip name and your friends. No email or password needed.",
    },
    {
      num: bn ? "২" : "2",
      icon: "🔗",
      title: bn ? "লিংক শেয়ার করুন" : "Share the link",
      body: bn
        ? "হোয়াটসঅ্যাপ বা মেসেঞ্জার গ্রুপে লিংক পাঠান। যে ক্লিক করবে সে-ই ট্রিপে যুক্ত হবে।"
        : "Send the link to WhatsApp or Messenger. Anyone with the link is in.",
    },
    {
      num: bn ? "৩" : "3",
      icon: "⚡",
      title: bn ? "খরচ লিখুন, হিসাব শেষ" : "Add costs, see who pays whom",
      body: bn
        ? "বাংলা বা বাংলিশে খরচ লিখলেই কে কাকে কত দেবে তা সাথে সাথে দেখতে পাবেন।"
        : "Type costs in Bangla or Banglish, and fair settle-up debts update instantly.",
    },
  ];

  const features = [
    {
      icon: "🤖",
      title: bn ? "এআই মেসেজ পার্সার" : "AI Expense Parser",
      body: bn
        ? "মেসেজের মতো বাংলা বা বাংলিশে লিখলেই এআই নিজে থেকেই খরচের এন্ট্রি ও ভাগ বানিয়ে দেয়।"
        : "Write costs naturally like a text message in Bangla or Banglish. AI converts them instantly into split cards.",
    },
    {
      icon: "৳",
      title: bn ? "পূর্ণ টাকার হিসাব" : "Whole BDT (৳) Fair Split",
      body: bn
        ? "পয়সা বা ভগ্নাংশের কোনো ঝামেলা নেই। বুদ্ধিমান রাউন্ডিংয়ের মাধ্যমে প্রতি টাকার হিসাব থাকে শতভাগ স্বচ্ছ।"
        : "Zero paisa, zero fractions. Smart integer rounding ensures fair and perfectly balanced debts.",
    },
    {
      icon: "🗳️",
      title: bn ? "গন্তব্য ভোটিং" : "Destination Voting",
      body: bn
        ? "বন্ধুরা সবাই পছন্দের জায়গায় ভোট দিন। শীর্ষ ভোট পাওয়া জায়গাটি ক্রিয়েটর এক ট্যাপে গন্তব্য হিসেবে সেট করতে পারেন।"
        : "Democratic trip voting where friends vote on options, and the creator can set the top pick as destination.",
    },
    {
      icon: "📊",
      title: bn ? "ভ্রমণ সূচি ও শিট" : "Daily Itinerary & Cost Sheet",
      body: bn
        ? "দিনভিত্তিক ভ্রমণ পরিকল্পনা, আকর্ষণীয় শেয়ার ইমেজ কার্ড এবং এক্সেল/সিএসভি খরচের শিট এক ক্লিকেই ডাউনলোড।"
        : "Day-by-day activity plan, downloadable shareable PNG card, and CSV cost sheets for the whole group.",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1208px] flex-col gap-5 sm:gap-8 py-2 sm:py-6">
      {/* Floating Back to Trip Widget (0px layout height, fixed on side like chat button) */}
      <BackToTripBar locale={locale as SupportedLocale} />

      {/* 1. Your trips section (if recent trips exist) */}
      <RecentTripsList
        locale={locale as SupportedLocale}
        labels={{
          sectionTitle: tRecent("yourTripsTitle"),
          myMemberPrefix: tRecent("asMember"),
          removeButtonAria: tRecent("removeFromList"),
          removeButtonTitle: tRecent("removeFromList"),
        }}
      />

      {/* HERO SECTION */}
      <section className="grid items-center gap-6 sm:gap-8 lg:grid-cols-12 lg:gap-12 min-w-0 w-full">
        {/* Left Column: Heading, Value Prop & Actions */}
        <div className="flex flex-col items-start gap-4 sm:gap-5 lg:col-span-7 min-w-0 w-full">
          {/* Badge */}
          <div className="inline-flex max-w-full items-center gap-1.5 min-[360px]:gap-2 rounded-2xl min-[360px]:rounded-full border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 px-3 py-1.5 min-[360px]:px-3.5 text-[11px] min-[360px]:text-xs font-bold leading-snug text-[var(--color-primary)] shadow-2xs">
            <span className="shrink-0">✨</span>
            <span className="break-words">
              {bn
                ? "বাংলাদেশের বন্ধুদের গ্রুপ ট্যুরের হিসাব"
                : "Group Travel & Expense Splitter for Bangladesh"}
            </span>
          </div>

          <h1 className="text-2xl min-[360px]:text-3xl font-black tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-[46px] leading-[1.2] sm:leading-[1.18] break-words">
            {bn ? (
              <>
                ট্যুরের খরচ ভাগ করুন,{" "}
                <span className="text-[var(--color-primary)]">ঝগড়া ছাড়াই।</span>
              </>
            ) : (
              <>
                Split trip costs with friends.{" "}
                <span className="text-[var(--color-primary)]">
                  Skip the arguments.
                </span>
              </>
            )}
          </h1>

          <p className="max-w-xl text-sm min-[360px]:text-base sm:text-lg text-neutral-500 leading-relaxed">
            {bn
              ? "হোটেল, খাবার, গাড়ি ভাড়ার হিসাব রাখুন এক জায়গায়। বাংলা বা বাংলিশ মেসেজ লিখলেই এআই হিসাব বানিয়ে দেবে। পয়সা ছাড়া নিখুঁত পূর্ণ টাকার হিসাব।"
              : "Track hotels, food, and transport in one shared place. Just type what you spent in natural Bangla or Banglish, and AI splits it fairly in whole BDT."}
          </p>

          {/* Action Buttons */}
          <div className="flex w-full flex-col gap-2.5 sm:gap-3 sm:w-auto sm:flex-row pt-1">
            <Link
              href="/trips/new"
              className="group inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center gap-2 rounded-full bg-[#e8f5ee] border border-emerald-300/80 px-5 min-[360px]:px-7 text-sm min-[360px]:text-base font-extrabold text-[#0f6b4a] shadow-2xs transition-all hover:bg-[#daf0e3] hover:border-emerald-400 active:scale-[0.98]"
            >
              <span>{t("createTrip")}</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>

            <Link
              href="/trips/join"
              className="inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-5 min-[360px]:px-7 text-sm min-[360px]:text-base font-bold text-gray-800 shadow-2xs transition-all hover:bg-gray-50 active:scale-[0.98]"
            >
              <span>🔗</span>
              <span>{t("joinTrip")}</span>
            </Link>
          </div>

          {/* Trust points */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] min-[360px]:text-xs font-medium text-neutral-400 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span>⚡</span>
              <span>
                {bn ? "লগইন ঝামেলাহীন" : "No login needed"}
              </span>
            </span>
            <span className="text-neutral-300 hidden min-[400px]:inline" aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span>৳</span>
              <span>
                {bn ? "পূর্ণ টাকার হিসাব" : "Whole BDT only"}
              </span>
            </span>
            <span className="text-neutral-300 hidden min-[400px]:inline" aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span>🤖</span>
              <span>
                {bn ? "এআই মেসেজ পার্সার" : "Bangla/Banglish AI"}
              </span>
            </span>
          </div>
        </div>

        {/* Right Column: AI Expense Explainer Demo */}
        <div className="w-full lg:col-span-5 flex justify-start lg:justify-center min-w-0">
          <ExpenseExplainerDemo
            locale={locale as "bn" | "en"}
            mode="landing"
            className="mx-0 lg:mx-auto"
          />
        </div>
      </section>

      {/* 3-STEP HOW IT WORKS */}
      <section className="flex flex-col gap-6 pt-4">
        <div className="text-center sm:text-left space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-fg)] sm:text-3xl">
            {bn ? "তিন ধাপে সহজ হিসাব" : "Three simple steps"}
          </h2>
          <p className="text-sm text-neutral-400">
            {bn
              ? "কোনো জটিল সেটআপ ছাড়া বন্ধুদের সাথে যেভাবে ট্যুর শুরু করবেন"
              : "How to run fair group trip accounts without complex setup"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm font-bold text-white shadow-xs">
                  {step.num}
                </span>
                <span className="text-2xl">{step.icon}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-[var(--color-fg)]">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-400">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* KEY FEATURES GRID */}
      <section className="flex flex-col gap-6 pt-4">
        <div className="text-center sm:text-left space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-fg)] sm:text-3xl">
            {bn ? "প্রতিটি ট্রিপে যা পাবেন" : "What is included in every trip"}
          </h2>
          <p className="text-sm text-neutral-400">
            {bn
              ? "বাংলাদেশের ট্যুরের বাস্তব অভিজ্ঞতার আলোকে তৈরি বিশেষ সুবিধাসমূহ"
              : "Built specifically for realistic travel dynamics in Bangladesh"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((item) => (
            <div
              key={item.title}
              className="flex flex-col items-start gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-all hover:shadow-md hover:border-[var(--color-primary)]/30"
            >
              <span className="text-3xl">{item.icon}</span>
              <h3 className="text-base font-bold text-[var(--color-fg)]">
                {item.title}
              </h3>
              <p className="text-xs leading-relaxed text-neutral-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* BOTTOM CALL-TO-ACTION BANNER */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-emerald-800 via-[var(--color-primary)] to-emerald-950 p-5 sm:p-8 text-white shadow-lg sm:flex-row sm:items-center">
        <div className="space-y-1.5 max-w-lg">
          <h2 className="text-xl min-[360px]:text-2xl font-black leading-snug sm:text-3xl">
            {bn
              ? "পরের ট্যুরের হিসাব এখনই শুরু করুন।"
              : "Start the next trip's accounts now."}
          </h2>
          <p className="text-sm text-emerald-100/90 leading-relaxed">
            {bn
              ? "কোনো পাসওয়ার্ড বা সাইন-আপ লাগবে না। লিংক শেয়ার করলেই বন্ধুরা যুক্ত হয়ে যাবে।"
              : "No passwords or signups. Share the link and your friends are in."}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row shrink-0">
          <Link
            href="/trips/new"
            className="inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center gap-1.5 rounded-full bg-white px-5 min-[360px]:px-7 text-sm min-[360px]:text-base font-bold text-[#0f6b4a] shadow-md transition-all hover:bg-gray-50 active:scale-[0.98]"
          >
            <span>{t("createTrip")}</span>
            <span>→</span>
          </Link>

          <Link
            href="/trips/join"
            className="inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center rounded-full border border-white/40 bg-white/10 px-5 min-[360px]:px-6 text-sm min-[360px]:text-base font-bold text-white transition-all hover:bg-white/20 active:scale-[0.98]"
          >
            🔗 {t("joinTrip")}
          </Link>
        </div>
      </section>
    </div>
  );
}
