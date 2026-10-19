import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BRAND } from "@/config/brand";
import { BackToTripBar } from "@/components/BackToTripBar";
import { RecentTripsList } from "@/components/RecentTripsList";
import type { SupportedLocale } from "@/lib/format";
import { buildLandingJsonLd, serializeJsonLd } from "@/lib/json-ld";

const ExpenseExplainerDemo = dynamic(
  () =>
    import("@/components/ExpenseExplainerDemo").then(
      (mod) => mod.ExpenseExplainerDemo
    )
);

export default async function HomePage() {
  const t = await getTranslations("app");
  const tRecent = await getTranslations("recentTrips");
  const locale = await getLocale();
  const bn = locale === "bn";
  const brandName = BRAND.name[bn ? "bn" : "en"];

  const steps = [
    {
      num: bn ? "১" : "1",
      icon: "🌴",
      title: bn ? "ট্রিপ খুলুন ও বন্ধুদের নাম দিন" : "Create a trip",
      body: bn
        ? "লগইন বা সাইন-আপ ছাড়া শুধু ট্রিপের নাম এবং বন্ধুদের নাম দিয়ে এক ক্লিকে ট্রিপ তৈরি করুন।"
        : "Start instantly with a trip name and friends. No login, password, or signup needed.",
    },
    {
      num: bn ? "২" : "2",
      icon: "🔗",
      title: bn ? "লিংক শেয়ার করুন" : "Share the link",
      body: bn
        ? "হোয়াটসঅ্যাপ বা মেসেঞ্জারে ট্রিপের গোপন লিংক বন্ধুদের দিন। যে কেউ লিংকে ঢুকে নিজের নাম বেছে যুক্ত হতে পারবে।"
        : "Send the secret trip link to WhatsApp or Messenger. Anyone with the link joins with just their name.",
    },
    {
      num: bn ? "৩" : "3",
      icon: "⚡",
      title: bn ? "খরচ লিখুন, নিখুঁত হিসাব পান" : "Add costs and settle up",
      body: bn
        ? "বাংলা, ইংরেজি বা বাংলিশে খরচ লিখুন। পুরো টাকার (৳) হিসাবে কে কাকে কত দেবে সাথে সাথে বের হয়ে যাবে।"
        : "Type what you spent in Bangla, English, or Banglish. Balances update instantly in whole BDT.",
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

  const faqs = [
    {
      q: bn
        ? `${brandName} ব্যবহার করতে কি কোনো একাউন্ট বা লগইন করতে হবে?`
        : `Do I need an account or login to use ${brandName}?`,
      a: bn
        ? `না। ${brandName} ব্যবহার করতে কোনো ইমেইল, পাসওয়ার্ড বা লগইন লাগে না। সরাসরি ট্রিপের নাম দিয়ে হিসাব শুরু করতে পারেন।`
        : `No. ${brandName} does not require any email, password, or account. You can start managing trip expenses immediately.`,
    },
    {
      q: bn
        ? "বন্ধুরা কীভাবে ট্রিপে যুক্ত হবে?"
        : "How do friends join a trip?",
      a: bn
        ? "ট্রিপ তৈরি করার পর গোপন লিংকটি বন্ধুদের সাথে শেয়ার করুন। লিংকে ক্লিক করে যে কেউ নিজের নাম বেছে নিয়ে বা নতুন নাম যোগ করে ট্রিপে যুক্ত হতে পারে।"
        : "Share the secret trip link with your group. Friends join simply by opening the link and selecting or adding their name.",
    },
    {
      q: bn
        ? "খরচের বিবরণ কোন ভাষায় লেখা যাবে?"
        : "What languages can I use to record expenses?",
      a: bn
        ? "বাংলা, ইংরেজি অথবা বাংলিশ—যেকোনো ভাষায় স্বাভাবিক মেসেজের মতো খরচ লিখতে পারেন। যেমন: 'হোটেল ভাড়া ৩০০০ তানভীর দিসে'।"
        : "You can type expenses naturally in Bangla, English, or Banglish (for example: 'Hotel rent 3000 paid by Tanvir').",
    },
    {
      q: bn
        ? "খরচের ভাগ ও দেনা-পাওনা কীভাবে হিসাব হয়?"
        : "How are expense shares and balances calculated?",
      a: bn
        ? "সব হিসাব পূর্ণ টাকায় (৳) সম্পন্ন হয়। কোনো পয়সা বা ভগ্নাংশের ঝামেলা নেই, তাই বন্ধুদের মধ্যে দেনা-পাওনার হিসাব সহজে পরিশোধযোগ্য ও পরিষ্কার থাকে।"
        : "All balances are calculated in whole BDT (৳). There are no fractions or paisa, making settlement clear and simple.",
    },
    {
      q: bn
        ? `${brandName} কি সরাসরি টাকা লেনদেন বা পেমেন্ট প্রসেস করে?`
        : `Does ${brandName} process payments directly?`,
      a: bn
        ? `না। ${brandName} শুধু কে কাকে কত দেবে সেই হিসাব বের করে দেয়। ${brandName}-এর মাধ্যমে কোনো টাকা লেনদেন বা পেমেন্ট প্রসেসিং হয় না; বন্ধুরা নিজেদের সুবিধামতো বিকাশ, নগদ বা ক্যাশে দেনা মিটিয়ে নেন।`
        : `No. ${brandName} calculates who owes whom, but does not process payments. Group members settle up directly using bKash, Nagad, bank transfer, or cash.`,
    },
  ];

  const jsonLd = buildLandingJsonLd(bn ? "bn" : "en");
  const jsonLdScript = serializeJsonLd(jsonLd);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript }}
      />
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
              <span className="shrink-0" aria-hidden="true">✨</span>
              <span className="break-words">
                {t("tagline")}
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
                <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </Link>

              <Link
                href="/trips/join"
                className="inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-5 min-[360px]:px-7 text-sm min-[360px]:text-base font-bold text-gray-800 shadow-2xs transition-all hover:bg-gray-50 active:scale-[0.98]"
              >
                <span aria-hidden="true">🔗</span>
                <span>{t("joinTrip")}</span>
              </Link>
            </div>

            {/* Trust points */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] min-[360px]:text-xs font-medium text-neutral-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">⚡</span>
                <span>
                  {bn ? "লগইন ঝামেলাহীন" : "No login needed"}
                </span>
              </span>
              <span className="text-neutral-300 hidden min-[400px]:inline" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">৳</span>
                <span>
                  {bn ? "পূর্ণ টাকার হিসাব" : "Whole BDT only"}
                </span>
              </span>
              <span className="text-neutral-300 hidden min-[400px]:inline" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">🤖</span>
                <span>
                  {bn ? "এআই মেসেজ পার্সার" : "Bangla/Banglish AI"}
                </span>
              </span>
            </div>
          </div>

          {/* Right Column: AI Expense Explainer Demo (lazy-loaded below mobile fold) */}
          <div className="w-full lg:col-span-5 flex justify-start lg:justify-center min-w-0">
            <Suspense
              fallback={
                <div
                  className="w-full max-w-[400px] h-[360px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 animate-pulse mx-0 lg:mx-auto"
                  aria-hidden="true"
                />
              }
            >
              <ExpenseExplainerDemo
                locale={locale as "bn" | "en"}
                mode="landing"
                className="mx-0 lg:mx-auto"
              />
            </Suspense>
          </div>
        </section>

        {/* 3-STEP HOW IT WORKS */}
        <section className="flex flex-col gap-6 pt-4">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-[var(--color-fg)] sm:text-3xl">
              {bn ? "কীভাবে কাজ করে" : "How it works"}
            </h2>
            <p className="text-sm text-neutral-400">
              {bn
                ? "কোনো জটিল সেটআপ ছাড়া ৩টি সহজ ধাপে ট্যুরের হিসাব শুরু করুন"
                : "Three simple steps to manage group trip expenses"}
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
                  <span className="text-2xl" aria-hidden="true">{step.icon}</span>
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
                <span className="text-3xl" aria-hidden="true">{item.icon}</span>
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

        {/* FAQ SECTION (Plain HTML details/summary, zero client JS) */}
        <section className="flex flex-col gap-6 pt-4">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-[var(--color-fg)] sm:text-3xl">
              {bn ? "সাধারণ জিজ্ঞাসা" : "Frequently Asked Questions"}
            </h2>
            <p className="text-sm text-neutral-400">
              {bn
                ? `${brandName} ব্যবহারের প্রয়োজনীয় তথ্যাবলি`
                : `Frequently asked questions about using ${brandName}`}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 transition-colors hover:border-[var(--color-primary)]/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-[var(--color-fg)] text-base sm:text-lg focus:outline-hidden">
                  <span>{faq.q}</span>
                  <span
                    aria-hidden="true"
                    className="text-neutral-400 transition-transform duration-200 group-open:rotate-180 ml-2 shrink-0"
                  >
                    ▾
                  </span>
                </summary>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-neutral-500 border-t border-[var(--color-border)]/50 pt-3">
                  {faq.a}
                </p>
              </details>
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
              <span aria-hidden="true">→</span>
            </Link>

            <Link
              href="/trips/join"
              className="inline-flex min-h-[46px] min-[360px]:min-h-[50px] items-center justify-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-5 min-[360px]:px-6 text-sm min-[360px]:text-base font-bold text-white transition-all hover:bg-white/20 active:scale-[0.98]"
            >
              <span aria-hidden="true">🔗</span>
              <span>{t("joinTrip")}</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
