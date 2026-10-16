import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const bn = locale === "bn";

  // Whole-taka formatter
  const fmt = new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", {
    maximumFractionDigits: 0,
  });
  const taka = (n: number) => `৳${fmt.format(n)}`;

  const people = {
    rahim: bn ? "রহিম" : "Rahim",
    nusrat: bn ? "নুসরাত" : "Nusrat",
    tanvir: bn ? "তানভীর" : "Tanvir",
    mim: bn ? "মিম" : "Mim",
  };

  const settlements = [
    { from: people.mim, to: people.rahim, amount: 4500 },
    { from: people.tanvir, to: people.rahim, amount: 1700 },
    { from: people.nusrat, to: people.rahim, amount: 1300 },
  ];

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
    <div className="mx-auto flex w-full max-w-[1208px] flex-col gap-12 py-4 sm:gap-16 sm:py-8">
      {/* HERO SECTION */}
      <section className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left Column: Heading, Value Prop & Actions */}
        <div className="flex flex-col items-start gap-5 lg:col-span-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--color-primary)] shadow-2xs">
            <span>✨</span>
            <span>
              {bn
                ? "বাংলাদেশের বন্ধুদের গ্রুপ ট্যুরের হিসাব"
                : "Group Travel & Expense Splitter for Bangladesh"}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-[46px] leading-[1.18]">
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

          <p className="max-w-xl text-base sm:text-lg text-[var(--color-fg-muted)] leading-relaxed">
            {bn
              ? "হোটেল, খাবার, গাড়ি ভাড়ার হিসাব রাখুন এক জায়গায়। বাংলা বা বাংলিশ মেসেজ লিখলেই এআই হিসাব বানিয়ে দেবে। পয়সা ছাড়া নিখুঁত পূর্ণ টাকার হিসাব।"
              : "Track hotels, food, and transport in one shared place. Just type what you spent in natural Bangla or Banglish, and AI splits it fairly in whole BDT."}
          </p>

          {/* Action Buttons */}
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row pt-1">
            <Link
              href="/trips/new"
              className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-emerald-700 px-7 text-base font-bold text-white shadow-md transition-all hover:shadow-lg hover:brightness-105 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              <span>➕</span>
              <span>{t("createTrip")}</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>

            <Link
              href="/trips/join"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 text-base font-bold text-[var(--color-fg)] shadow-xs transition-all hover:bg-[var(--color-surface-muted)] hover:border-[var(--color-primary)]/40 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              <span>🔗</span>
              <span>{t("joinTrip")}</span>
            </Link>
          </div>

          {/* Trust points */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[var(--color-fg-muted)] pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span>⚡</span>
              <span>
                {bn ? "লগইন ঝামেলাহীন" : "No login needed"}
              </span>
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span>৳</span>
              <span>
                {bn ? "পূর্ণ টাকার হিসাব" : "Whole BDT only"}
              </span>
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5">
              <span>🤖</span>
              <span>
                {bn ? "এআই মেসেজ পার্সার" : "Bangla/Banglish AI"}
              </span>
            </span>
          </div>
        </div>

        {/* Right Column: Live Mockup Snapshot Preview */}
        <div className="w-full lg:col-span-5">
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-md transition-all hover:shadow-lg">
            {/* Top header badge */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌴</span>
                <div>
                  <p className="text-sm font-extrabold text-[var(--color-fg)]">
                    {bn ? "সাজেক ভ্যালি ট্যুর ২০২৬" : "Sajek Tour 2026"}
                  </p>
                  <p className="text-[11px] text-[var(--color-fg-muted)]">
                    {bn ? "৪ জন সদস্য • পূর্ণ টাকা" : "4 members • Whole BDT"}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-300">
                🟢 {bn ? "লাইভ ডেমো" : "Live Demo"}
              </span>
            </div>

            {/* Chat message input snippet */}
            <div className="mt-4 space-y-1.5">
              <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider block">
                {bn ? "১. গ্রুপে মেসেজ দিন" : "1. Type naturally"}
              </span>
              <div className="flex items-start gap-2 rounded-2xl bg-[var(--color-surface-muted)] p-3 text-sm font-medium text-[var(--color-fg)] border border-[var(--color-border)]">
                <span className="text-base">💬</span>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--color-fg)]">
                    {bn
                      ? '"হোটেল ১২০০০ রহিম দিছে, সবাই ভাগ"'
                      : '"hotel 12000 rahim dilo, sobai bhag"'}
                  </p>
                  <span className="text-[10px] text-[var(--color-primary)] font-bold mt-0.5 block">
                    🤖 {bn ? "এআই নিমেষেই পার্স করেছে" : "AI auto-parsed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Auto-created expense card */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)]/40 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-fg)] flex items-center gap-1.5">
                  <span>🏨</span>
                  <span>{bn ? "হোটেল রুম" : "Hotel Room"}</span>
                </p>
                <p className="text-[11px] text-[var(--color-fg-muted)]">
                  {bn
                    ? `${people.rahim} দিয়েছেন • ৪ জনে সমান ভাগ`
                    : `Paid by ${people.rahim} • 4 equal shares`}
                </p>
              </div>
              <p className="text-base font-black text-[var(--color-primary)] shrink-0">
                {taka(12000)}
              </p>
            </div>

            {/* Simplified Settle-up transfers */}
            <div className="mt-4 border-t border-[var(--color-border)] pt-3.5">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-[var(--color-fg)] flex items-center gap-1">
                  <span>🤝</span>
                  <span>{bn ? "কে কাকে কত দেবে (সহজ হিসাব)" : "Who owes whom (simplified)"}</span>
                </p>
                <span className="text-[11px] font-semibold text-[var(--color-primary)]">
                  {bn ? `মোট ${taka(18000)}` : `${taka(18000)} total`}
                </span>
              </div>

              <ul className="space-y-1.5">
                {settlements.map((s) => (
                  <li
                    key={s.from}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[var(--color-fg)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[10px]">
                        👤
                      </span>
                      <span>{s.from}</span>
                      <span className="text-[10px] text-[var(--color-fg-muted)] font-normal">
                        → {bn ? "দেবে" : "pays"} →
                      </span>
                      <span>{s.to}</span>
                    </div>
                    <span className="font-extrabold text-[var(--color-primary)]">
                      {taka(s.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 3-STEP HOW IT WORKS */}
      <section className="flex flex-col gap-6 pt-4">
        <div className="text-center sm:text-left space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-fg)] sm:text-3xl">
            {bn ? "তিন ধাপে সহজ হিসাব" : "Three simple steps"}
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
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
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
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
          <p className="text-sm text-[var(--color-fg-muted)]">
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
              <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* BOTTOM CALL-TO-ACTION BANNER */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-emerald-800 via-[var(--color-primary)] to-emerald-950 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:p-8">
        <div className="space-y-1.5 max-w-lg">
          <h2 className="text-2xl font-black leading-snug sm:text-3xl">
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
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-white px-7 text-base font-bold text-[var(--color-primary)] shadow-md transition-all hover:brightness-95 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ➕ {t("createTrip")}
          </Link>

          <Link
            href="/trips/join"
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-6 text-base font-bold text-white transition-all hover:bg-white/20 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            🔗 {t("joinTrip")}
          </Link>
        </div>
      </section>
    </div>
  );
}
